import { QueryClient, QueryObserver, partialMatchKey } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import {
  historyInfiniteQueryKey,
  listQueryKey,
  meQueryKey,
  presenceQueryKey,
  type ConversationResponse,
  type PresenceView,
} from "@/lib/api";
import type { History } from "@/features/messages/history";
import { allMessagesKey, messagesKey } from "@/features/messages/queries";
import { createTypingTracker } from "@/features/presence/typing-tracker";
import { allPresenceKey } from "@/features/presence/use-presence";
import { catchUp, handleEvent, recordBlock, recordProfile, recordSettings } from "./sync";

const conversation = (lastSeq: number, unread: number): ConversationResponse => ({
  id: "c1",
  type: "DIRECT",
  unreadCount: unread,
  updatedAt: "2026-03-10T09:00:00Z",
  lastMessage: { id: `m${lastSeq}`, seq: lastSeq, senderId: "grace", body: `m${lastSeq}` },
});

const newMessage = (seq: number) =>
  JSON.stringify({
    type: "message.created",
    conversationId: "c1",
    message: { id: `m${seq}`, conversationId: "c1", seq, senderId: "grace", body: `m${seq}`, createdAt: "2026-03-10T10:00:00Z" },
  });

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

const stops: (() => void)[] = [];
afterEach(() => stops.splice(0).forEach((stop) => stop()));

/** A client with the list on screen (an observer), as it is in the app; each fetch is answered by the test. */
function withList(initial: ConversationResponse[]) {
  const client = new QueryClient();
  client.setQueryData(meQueryKey(), { id: "me" });
  client.setQueryData(listQueryKey(), initial);
  const answers: ReturnType<typeof deferred<ConversationResponse[]>>[] = [];
  const observer = new QueryObserver(client, {
    queryKey: listQueryKey(),
    staleTime: Infinity,
    queryFn: () => {
      const answer = deferred<ConversationResponse[]>();
      answers.push(answer);
      return answer.promise;
    },
  });
  stops.push(observer.subscribe(() => {}));
  return { client, answers };
}

describe("handleEvent while a detached window is open", () => {
  it("keeps live Messages out of the window and asks for no catch-up, while the list still learns of them", () => {
    const { client } = withList([conversation(200, 0)]);
    const window: History = {
      pages: [{ messages: [19, 20, 21].map((seq) => ({ id: `m${seq}`, conversationId: "c1", seq, senderId: "grace", body: `m${seq}` })), hasMore: true, hasOlder: true, hasNewer: true }],
      pageParams: [{ path: { conversationId: "c1" }, query: { aroundSeq: 20 } }],
    };
    client.setQueryData(messagesKey("c1"), window);

    handleEvent(client, newMessage(201), createTypingTracker());

    expect(client.getQueryData(messagesKey("c1"))).toBe(window);
    expect(client.isFetching(), "no catch-up was started").toBe(0);
    expect(client.getQueryData<ConversationResponse[]>(listQueryKey())?.[0].lastMessage?.seq).toBe(201);
  });

  it("does not restart a page being fetched for the window when a new Message arrives (it would starve paging)", async () => {
    const { client } = withList([conversation(200, 0)]);
    const window: History = {
      pages: [{ messages: [{ id: "m20", conversationId: "c1", seq: 20, senderId: "grace", body: "m20" }], hasMore: true, hasOlder: true, hasNewer: true }],
      pageParams: [{ path: { conversationId: "c1" }, query: { aroundSeq: 20 } }],
    };
    client.setQueryData(messagesKey("c1"), window);
    let fetches = 0;
    const observer = new QueryObserver(client, {
      queryKey: messagesKey("c1"),
      staleTime: Infinity,
      queryFn: () => {
        fetches += 1;
        return deferred<History>().promise;
      },
    });
    stops.push(observer.subscribe(() => {}));
    void observer.refetch(); // a page is being fetched
    await Promise.resolve();
    expect(fetches).toBe(1);

    handleEvent(client, newMessage(201), createTypingTracker());
    await Promise.resolve();

    expect(fetches, "the fetch under way was left alone").toBe(1);
  });
});

describe("handleEvent", () => {
  it("puts a new Message into the list that is on screen", () => {
    const { client, answers } = withList([conversation(2, 0)]);

    handleEvent(client, newMessage(3), createTypingTracker());

    const list = client.getQueryData<ConversationResponse[]>(listQueryKey());
    expect(list?.[0].lastMessage?.seq).toBe(3);
    expect(list?.[0].unreadCount).toBe(1);
    expect(answers, "nothing needed asking for").toHaveLength(0);
  });

  it("does not patch a list whose request is under way (its answer would undo the patch), but asks again", async () => {
    const { client, answers } = withList([conversation(2, 0)]);
    void client.invalidateQueries({ queryKey: listQueryKey() }); // a request starts
    await Promise.resolve();
    expect(answers).toHaveLength(1);

    handleEvent(client, newMessage(3), createTypingTracker());
    await Promise.resolve();

    expect(answers, "the request was restarted, so its answer is not older than the event").toHaveLength(2);
    expect(client.getQueryData<ConversationResponse[]>(listQueryKey())?.[0].lastMessage?.seq, "not patched").toBe(2);

    answers[0].resolve([conversation(2, 0)]); // the cancelled one answering late changes nothing
    answers[1].resolve([conversation(3, 1)]);
    await client.getQueryCache().find({ queryKey: listQueryKey() })?.promise;
    expect(client.getQueryData<ConversationResponse[]>(listQueryKey())?.[0].lastMessage?.seq).toBe(3);
  });

  it("ignores what is not an event, and kinds it does not act on", () => {
    const { client, answers } = withList([conversation(2, 0)]);
    const before = client.getQueryData(listQueryKey());

    handleEvent(client, "not json", createTypingTracker());
    handleEvent(client, JSON.stringify({ type: "something.new", conversationId: "c1" }), createTypingTracker());

    expect(client.getQueryData(listQueryKey())).toBe(before);
    expect(answers).toHaveLength(0);
  });
});

describe("edited and deleted Messages", () => {
  const stored = (seq: number, extra: object = {}) => ({
    id: `m${seq}`,
    conversationId: "c1",
    seq,
    senderId: "grace",
    body: `m${seq}`,
    createdAt: "2026-03-10T10:00:00Z",
    ...extra,
  });
  const update = (message: object) => JSON.stringify({ type: "message.updated", conversationId: "c1", message });
  const loadedHistory = (): History => ({ pages: [{ messages: [stored(1), stored(2)], hasMore: false }], pageParams: [{}] });

  it("shows an edit in the history and on the list's latest line, and asks for nothing", () => {
    const { client, answers } = withList([conversation(2, 0)]);
    client.setQueryData(messagesKey("c1"), loadedHistory());

    handleEvent(client, update(stored(2, { body: "fixed", editedAt: "2026-03-10T10:05:00Z" })), createTypingTracker());

    expect(client.getQueryData<History>(messagesKey("c1"))?.pages[0].messages?.map((m) => m.body)).toEqual(["m1", "fixed"]);
    expect(client.getQueryData<ConversationResponse[]>(listQueryKey())?.[0].lastMessage?.body).toBe("fixed");
    expect(client.getQueryData<ConversationResponse[]>(listQueryKey())?.[0].unreadCount, "not a new unread Message").toBe(0);
    expect(answers).toHaveLength(0);
  });

  it("shows a deletion as a placeholder with no text", () => {
    const { client } = withList([conversation(2, 0)]);
    client.setQueryData(messagesKey("c1"), loadedHistory());

    handleEvent(client, update({ id: "m2", conversationId: "c1", seq: 2, senderId: "grace", deletedAt: "2026-03-10T10:06:00Z" }), createTypingTracker());

    const message = client.getQueryData<History>(messagesKey("c1"))?.pages[0].messages?.[1];
    expect(message?.deletedAt).toBe("2026-03-10T10:06:00Z");
    expect(message?.body).toBeUndefined();
  });

  it("does not patch a history whose request is under way (its answer may predate the edit), but asks again", async () => {
    const { client } = withList([conversation(2, 0)]);
    client.setQueryData(messagesKey("c1"), loadedHistory());
    let asked = 0;
    stops.push(
      new QueryObserver(client, {
        queryKey: messagesKey("c1"),
        staleTime: Infinity,
        queryFn: () => (asked++, new Promise<History>(() => {})),
      }).subscribe(() => {}),
    );
    void client.invalidateQueries({ queryKey: messagesKey("c1") });
    await Promise.resolve();
    expect(asked).toBe(1);

    handleEvent(client, update(stored(2, { body: "fixed", editedAt: "2026-03-10T10:05:00Z" })), createTypingTracker());
    await Promise.resolve();

    expect(asked, "the request was restarted").toBe(2);
    expect(client.getQueryData<History>(messagesKey("c1"))?.pages[0].messages?.[1].body, "not patched").toBe("m2");
  });

  it("asks for the list again when the edit is about a Message newer than the latest line", async () => {
    const { client, answers } = withList([conversation(2, 0)]);

    handleEvent(client, update(stored(5, { editedAt: "2026-03-10T10:05:00Z" })), createTypingTracker());
    await Promise.resolve();

    expect(answers).toHaveLength(1);
  });
});

describe("reaction events", () => {
  const THUMBS_UP = "\uD83D\uDC4D";
  const stored = (seq: number, extra: object = {}) => ({ id: `m${seq}`, conversationId: "c1", seq, senderId: "grace", body: `m${seq}`, ...extra });
  const reaction = (emoji: string | null, at: string, userId = "ada", messageId = "m2") =>
    JSON.stringify({ type: "reaction.changed", conversationId: "c1", messageId, seq: 2, userId, emoji, at });
  const loadedHistory = (): History => ({ pages: [{ messages: [stored(1), stored(2)], hasMore: false }], pageParams: [{}] });
  const reactionsOf = (client: QueryClient) => client.getQueryData<History>(messagesKey("c1"))?.pages[0].messages?.[1].reactions;

  it("puts a live reaction on the Message in the history on screen, and asks for nothing", () => {
    const { client, answers } = withList([conversation(2, 0)]);
    client.setQueryData(messagesKey("c1"), loadedHistory());

    handleEvent(client, reaction(THUMBS_UP, "2026-03-10T10:00:00Z"), createTypingTracker());

    expect(reactionsOf(client)).toEqual([{ emoji: THUMBS_UP, userIds: ["ada"] }]);
    expect(answers, "the list is not reloaded for a reaction").toHaveLength(0);
  });

  it("follows a person changing their mind and taking the reaction away, in the order they happened", () => {
    const { client } = withList([conversation(2, 0)]);
    client.setQueryData(messagesKey("c1"), loadedHistory());

    handleEvent(client, reaction(THUMBS_UP, "2026-03-10T10:00:00Z"), createTypingTracker());
    handleEvent(client, reaction("\u2764\uFE0F", "2026-03-10T10:01:00Z"), createTypingTracker());
    expect(reactionsOf(client)).toEqual([{ emoji: "\u2764\uFE0F", userIds: ["ada"] }]);

    handleEvent(client, reaction(null, "2026-03-10T10:02:00Z"), createTypingTracker());
    expect(reactionsOf(client)).toEqual([]);
  });

  it("ignores a word about a reaction that is older than one already heard, however late it arrives", () => {
    const { client } = withList([conversation(2, 0)]);
    client.setQueryData(messagesKey("c1"), loadedHistory());
    handleEvent(client, reaction(null, "2026-03-10T10:05:00Z"), createTypingTracker());

    handleEvent(client, reaction(THUMBS_UP, "2026-03-10T10:00:00Z"), createTypingTracker());

    expect(reactionsOf(client) ?? [], "the earlier reaction does not come back").toEqual([]);
  });

  it("takes someone out of every reaction when they left", () => {
    const { client } = withList([conversation(2, 0)]);
    client.setQueryData(messagesKey("c1"), loadedHistory());
    handleEvent(client, reaction(THUMBS_UP, "2026-03-10T10:00:00Z"), createTypingTracker());

    handleEvent(client, JSON.stringify({ type: "reactions.cleared", conversationId: "c1", userId: "ada" }), createTypingTracker());

    expect(reactionsOf(client)).toEqual([]);
  });

  it("does not patch a history whose request is under way (its answer may predate the reaction), but asks again", async () => {
    const { client } = withList([conversation(2, 0)]);
    client.setQueryData(messagesKey("c1"), loadedHistory());
    let asked = 0;
    stops.push(
      new QueryObserver(client, {
        queryKey: messagesKey("c1"),
        staleTime: Infinity,
        queryFn: () => (asked++, new Promise<History>(() => {})),
      }).subscribe(() => {}),
    );
    void client.invalidateQueries({ queryKey: messagesKey("c1") });
    await Promise.resolve();
    expect(asked).toBe(1);

    handleEvent(client, reaction(THUMBS_UP, "2026-03-10T10:00:00Z"), createTypingTracker());
    await Promise.resolve();

    expect(asked, "the request was restarted").toBe(2);
    expect(reactionsOf(client), "not patched").toBeUndefined();
  });
});

describe("settings events", () => {
  const settingsEvent = (settings: object) => JSON.stringify({ type: "settings.changed", conversationId: "c1", settings });

  it("shows a change made in another tab: the list is patched and reordered, and nothing is asked for", () => {
    const other: ConversationResponse = { ...conversation(1, 0), id: "c0", updatedAt: "2026-03-10T10:00:00Z" };
    const { client, answers } = withList([other, conversation(2, 0)]);

    handleEvent(client, settingsEvent({ muted: true, archived: false, pinned: true }), createTypingTracker());

    const list = client.getQueryData<ConversationResponse[]>(listQueryKey());
    expect(list?.map((c) => c.id)).toEqual(["c1", "c0"]);
    expect(list?.[0].settings).toEqual({ muted: true, archived: false, pinned: true });
    expect(answers).toHaveLength(0);
  });

  it("does not patch a list whose request is under way, but asks again", async () => {
    const { client, answers } = withList([conversation(2, 0)]);
    void client.invalidateQueries({ queryKey: listQueryKey() });
    await Promise.resolve();

    handleEvent(client, settingsEvent({ muted: false, archived: true, pinned: false }), createTypingTracker());
    await Promise.resolve();

    expect(answers, "the request was restarted").toHaveLength(2);
    expect(client.getQueryData<ConversationResponse[]>(listQueryKey())?.[0].settings, "not patched").toBeUndefined();
  });

  it("records the answer to the person's own change the same way", () => {
    const { client } = withList([conversation(2, 0)]);

    recordSettings(client, "c1", { muted: false, archived: false, pinned: true });

    expect(client.getQueryData<ConversationResponse[]>(listQueryKey())?.[0].settings?.pinned).toBe(true);
  });
});

describe("typing and presence events", () => {
  const typingEvent = (typing: boolean, userId = "grace") =>
    JSON.stringify({ type: "typing.changed", conversationId: "c1", userId, typing });

  it("keeps track of who is typing, and forgets them when they stop", () => {
    const { client } = withList([conversation(2, 0)]);
    const tracker = createTypingTracker();

    handleEvent(client, typingEvent(true), tracker);
    expect(tracker.typing("c1")).toEqual(["grace"]);
    handleEvent(client, typingEvent(false), tracker);
    expect(tracker.typing("c1")).toEqual([]);
  });

  it("forgets someone who is typing when their Message arrives (sending ends typing)", () => {
    const { client } = withList([conversation(2, 0)]);
    const tracker = createTypingTracker();
    handleEvent(client, typingEvent(true, "grace"), tracker);
    handleEvent(client, typingEvent(true, "linus"), tracker);

    handleEvent(client, newMessage(3), tracker); // sent by grace

    expect(tracker.typing("c1")).toEqual(["linus"]);
  });

  it("puts a changed name into the list, and into the profile when it is the signed-in person's own", () => {
    const { client } = withList([{ ...conversation(2, 0), participants: [{ userId: "me", displayName: "Ada", role: "MEMBER" }, { userId: "grace", displayName: "Grace", role: "MEMBER" }] }]);
    client.setQueryData(meQueryKey(), { id: "me", displayName: "Ada" });

    handleEvent(client, JSON.stringify({ type: "profile.changed", userId: "grace", displayName: "Grace Hopper" }), createTypingTracker());
    expect(client.getQueryData<ConversationResponse[]>(listQueryKey())?.[0].participants?.[1].displayName).toBe("Grace Hopper");
    expect(client.getQueryData<{ displayName: string }>(meQueryKey())?.displayName).toBe("Ada");

    handleEvent(client, JSON.stringify({ type: "profile.changed", userId: "me", displayName: "Augusta Ada King" }), createTypingTracker());
    expect(client.getQueryData<ConversationResponse[]>(listQueryKey())?.[0].participants?.[0].displayName).toBe("Augusta Ada King");
    expect(client.getQueryData<{ displayName: string }>(meQueryKey())?.displayName).toBe("Augusta Ada King");
  });

  it("records the answer to the person's own name change the same way", () => {
    const { client } = withList([{ ...conversation(2, 0), participants: [{ userId: "me", displayName: "Ada", role: "MEMBER" }] }]);
    client.setQueryData(meQueryKey(), { id: "me", displayName: "Ada" });

    recordProfile(client, "me", { displayName: "Ada King" });

    expect(client.getQueryData<ConversationResponse[]>(listQueryKey())?.[0].participants?.[0].displayName).toBe("Ada King");
  });

  it("puts a new or removed Avatar into the list, and into the profile when it is the person's own", () => {
    const url = "http://files/avatars/me/a.png?expires=1&signature=x";
    const { client } = withList([{ ...conversation(2, 0), participants: [{ userId: "me", displayName: "Ada", role: "MEMBER" }] }]);
    client.setQueryData(meQueryKey(), { id: "me", displayName: "Ada" });

    handleEvent(client, JSON.stringify({ type: "profile.changed", userId: "me", avatarUrl: url }), createTypingTracker());
    expect(client.getQueryData<ConversationResponse[]>(listQueryKey())?.[0].participants?.[0].avatarUrl).toBe(url);
    expect(client.getQueryData(meQueryKey())).toEqual({ id: "me", displayName: "Ada", avatarUrl: url });

    handleEvent(client, JSON.stringify({ type: "profile.changed", userId: "me", avatarUrl: null }), createTypingTracker());
    expect(client.getQueryData<ConversationResponse[]>(listQueryKey())?.[0].participants?.[0].avatarUrl).toBeUndefined();
    expect(client.getQueryData(meQueryKey())).toEqual({ id: "me", displayName: "Ada" });
  });

  it("shows a person online or offline in every Conversation's presence that has loaded", () => {
    const { client } = withList([conversation(2, 0)]);
    const key = presenceQueryKey({ path: { conversationId: "c1" } });
    client.setQueryData<PresenceView[]>(key, [{ userId: "grace", online: false }]);

    handleEvent(client, JSON.stringify({ type: "presence.changed", userId: "grace", online: true }), createTypingTracker());

    expect(client.getQueryData<PresenceView[]>(key)).toEqual([{ userId: "grace", online: true, lastSeenAt: undefined }]);
  });

  it("asks for a Conversation's presence again when the Conversation changed (someone new may have joined)", async () => {
    const { client } = withList([conversation(2, 0)]);
    const key = presenceQueryKey({ path: { conversationId: "c1" } });
    const other = presenceQueryKey({ path: { conversationId: "c2" } });
    let asked = 0;
    const observe = (queryKey: typeof key) =>
      new QueryObserver(client, { queryKey, staleTime: Infinity, queryFn: async () => (asked++, [] as PresenceView[]) }).subscribe(() => {});
    stops.push(observe(key), observe(other));
    await client.getQueryCache().find({ queryKey: key })?.promise;
    await client.getQueryCache().find({ queryKey: other })?.promise;
    asked = 0;

    handleEvent(client, JSON.stringify({ type: "conversation.changed", conversationId: "c1" }), createTypingTracker());
    await Promise.resolve();
    await client.getQueryCache().find({ queryKey: key })?.promise;

    expect(asked, "only that Conversation's presence").toBe(1);
  });

  it("finds every key the generated helpers make, so none is missed when the generator changes", () => {
    expect(partialMatchKey(presenceQueryKey({ path: { conversationId: "c1" } }), allPresenceKey)).toBe(true);
    expect(partialMatchKey(historyInfiniteQueryKey({ path: { conversationId: "c1" } }), allMessagesKey)).toBe(true);
    expect(partialMatchKey(listQueryKey(), allPresenceKey)).toBe(false);
  });
});

describe("catchUp", () => {
  it("asks for the list again, even if it was only just fetched", async () => {
    const { client, answers } = withList([conversation(2, 0)]);

    catchUp(client);
    await Promise.resolve();

    expect(answers).toHaveLength(1);
  });
});

describe("recordBlock", () => {
  const direct = { ...conversation(2, 0), blocked: false, participants: [{ userId: "me" }, { userId: "grace" }] };

  it("marks the Direct conversation blocked from the event, and asks again for its Messages and presence", () => {
    const { client } = withList([direct]);
    client.setQueryData(messagesKey("c1"), { pages: [{ messages: [], hasMore: false }], pageParams: [{}] });
    client.setQueryData(presenceQueryKey({ path: { conversationId: "c1" } }), []);

    handleEvent(client, JSON.stringify({ type: "block.changed", userId: "grace", blocked: true }), createTypingTracker());

    expect(client.getQueryData<ConversationResponse[]>(listQueryKey())?.[0].blocked).toBe(true);
    // The other person's reactions are hidden or shown again, and presence goes or comes back, only on the server.
    expect(client.getQueryState(messagesKey("c1"))?.isInvalidated).toBe(true);
    expect(client.getQueryState(presenceQueryKey({ path: { conversationId: "c1" } }))?.isInvalidated).toBe(true);
  });

  it("does the same with the answer to the person's own change, and asks for the list when the Conversation is unknown", () => {
    const { client, answers } = withList([direct]);

    recordBlock(client, "grace", true);
    expect(client.getQueryData<ConversationResponse[]>(listQueryKey())?.[0].blocked).toBe(true);
    expect(answers).toHaveLength(0);

    recordBlock(client, "linus", true);
    expect(answers).toHaveLength(1);
  });
});
