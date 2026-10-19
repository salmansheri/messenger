import { describe, expect, it } from "vitest";
import type { ConversationResponse } from "@/lib/api";
import { latestFromOthers } from "./delivered";

const conversation = (id: string, lastSeq: number | undefined, senderId = "grace"): ConversationResponse => ({
  id,
  lastMessage: lastSeq === undefined ? undefined : { seq: lastSeq, senderId },
});

describe("latestFromOthers", () => {
  it("picks the latest Message of each Conversation that someone else sent", () => {
    expect(latestFromOthers([conversation("a", 4), conversation("b", 9, "linus")], "me")).toEqual([
      { conversationId: "a", seq: 4 },
      { conversationId: "b", seq: 9 },
    ]);
  });

  it("skips Conversations whose latest Message is your own, or that have none", () => {
    expect(latestFromOthers([conversation("a", 4, "me"), conversation("b", undefined)], "me")).toEqual([]);
  });

  it("skips everything when it is not known who you are", () => {
    expect(latestFromOthers([conversation("a", 4)], undefined)).toEqual([]);
  });
});
