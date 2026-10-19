import { QueryClient, QueryObserver } from "@tanstack/react-query";
import { afterEach, describe, expect, it } from "vitest";
import type { ConversationResponse } from "@/lib/api";
import { conversationsKey } from "@/features/conversations/queries";
import { meKey } from "@/features/session/use-me";
import { catchUp, handleEvent } from "./sync";

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
  client.setQueryData(meKey, { id: "me" });
  client.setQueryData(conversationsKey, initial);
  const answers: ReturnType<typeof deferred<ConversationResponse[]>>[] = [];
  const observer = new QueryObserver(client, {
    queryKey: conversationsKey,
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

describe("handleEvent", () => {
  it("puts a new Message into the list that is on screen", () => {
    const { client, answers } = withList([conversation(2, 0)]);

    handleEvent(client, newMessage(3));

    const list = client.getQueryData<ConversationResponse[]>(conversationsKey);
    expect(list?.[0].lastMessage?.seq).toBe(3);
    expect(list?.[0].unreadCount).toBe(1);
    expect(answers, "nothing needed asking for").toHaveLength(0);
  });

  it("does not patch a list whose request is under way (its answer would undo the patch), but asks again", async () => {
    const { client, answers } = withList([conversation(2, 0)]);
    void client.invalidateQueries({ queryKey: conversationsKey }); // a request starts
    await Promise.resolve();
    expect(answers).toHaveLength(1);

    handleEvent(client, newMessage(3));
    await Promise.resolve();

    expect(answers, "the request was restarted, so its answer is not older than the event").toHaveLength(2);
    expect(client.getQueryData<ConversationResponse[]>(conversationsKey)?.[0].lastMessage?.seq, "not patched").toBe(2);

    answers[0].resolve([conversation(2, 0)]); // the cancelled one answering late changes nothing
    answers[1].resolve([conversation(3, 1)]);
    await client.getQueryCache().find({ queryKey: conversationsKey })?.promise;
    expect(client.getQueryData<ConversationResponse[]>(conversationsKey)?.[0].lastMessage?.seq).toBe(3);
  });

  it("ignores what is not an event, and kinds it does not act on", () => {
    const { client, answers } = withList([conversation(2, 0)]);
    const before = client.getQueryData(conversationsKey);

    handleEvent(client, "not json");
    handleEvent(client, JSON.stringify({ type: "typing.changed", conversationId: "c1" }));

    expect(client.getQueryData(conversationsKey)).toBe(before);
    expect(answers).toHaveLength(0);
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
