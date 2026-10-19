import { describe, expect, it } from "vitest";
import { parseEvent } from "./events";

const message = { id: "m1", conversationId: "c1", seq: 4, senderId: "u1", clientMessageId: "x", body: "Hi" };

describe("parseEvent", () => {
  it("reads a new Message", () => {
    expect(parseEvent(JSON.stringify({ type: "message.created", conversationId: "c1", message }))).toEqual({
      type: "message.created",
      conversationId: "c1",
      message,
    });
  });

  it("reads a change to a Conversation", () => {
    expect(parseEvent(JSON.stringify({ type: "conversation.changed", conversationId: "c1" }))).toEqual({
      type: "conversation.changed",
      conversationId: "c1",
    });
  });

  it("reads how far everyone else has got", () => {
    expect(
      parseEvent(JSON.stringify({ type: "receipts.updated", conversationId: "c1", deliveredUpTo: 5, readUpTo: 3 })),
    ).toEqual({ type: "receipts.updated", conversationId: "c1", deliveredUpTo: 5, readUpTo: 3 });
  });

  it("reads the person's own new unread count", () => {
    expect(
      parseEvent(
        JSON.stringify({ type: "unread.updated", conversationId: "c1", deliveredSeq: 9, readSeq: 8, unreadCount: 1 }),
      ),
    ).toEqual({ type: "unread.updated", conversationId: "c1", deliveredSeq: 9, readSeq: 8, unreadCount: 1 });
  });

  it("refuses receipt and unread events with numbers missing, rather than guessing", () => {
    expect(parseEvent(JSON.stringify({ type: "receipts.updated", conversationId: "c1", deliveredUpTo: 5 }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "receipts.updated", deliveredUpTo: 5, readUpTo: 3 }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "unread.updated", conversationId: "c1", unreadCount: "1" }))).toBeUndefined();
  });

  it("knows about kinds it does not act on yet, and about kinds it has never heard of, without failing", () => {
    for (const type of ["typing.changed", "presence.changed", "something.new"]) {
      expect(parseEvent(JSON.stringify({ type, conversationId: "c1" }))).toEqual({ type: "ignored" });
    }
  });

  it("refuses what is not an event at all", () => {
    for (const body of ["", "not json", "null", "42", "[]", JSON.stringify({ no: "type" })]) {
      expect(parseEvent(body)).toBeUndefined();
    }
  });

  it("refuses a Message event with no Message or no Conversation, rather than guessing", () => {
    expect(parseEvent(JSON.stringify({ type: "message.created", conversationId: "c1" }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "message.created", message }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "message.created", conversationId: "c1", message: { id: "m1" } }))).toBeUndefined();
    expect(parseEvent(JSON.stringify({ type: "conversation.changed" }))).toBeUndefined();
  });
});
