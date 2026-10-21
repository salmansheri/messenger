import { describe, expect, it } from "vitest";
import type { ConversationResponse, SearchResult } from "@/lib/api";
import { groupResults } from "./groups";

const ME = "me";
const result = (n: number, conversationId: string): SearchResult => ({ messageId: `m${n}`, conversationId, seq: n, senderId: "grace", snippet: `plan ${n}` });
const conversations: ConversationResponse[] = [
  {
    id: "d1",
    type: "DIRECT",
    participants: [
      { userId: ME, displayName: "Ada", role: "MEMBER" },
      { userId: "grace", displayName: "Grace Hopper", role: "MEMBER" },
    ],
  },
  { id: "g1", type: "GROUP", name: "Engines", participants: [] },
];

describe("groupResults", () => {
  it("puts results from the same Conversation that follow each other under its name, keeping newest first", () => {
    const groups = groupResults([result(9, "g1"), result(8, "g1"), result(7, "d1"), result(6, "g1")], conversations, ME);

    expect(groups.map((group) => [group.conversationId, group.title, group.results.map((r) => r.seq)])).toEqual([
      ["g1", "Engines", [9, 8]],
      ["d1", "Grace Hopper", [7]],
      ["g1", "Engines", [6]],
    ]);
  });

  it("gives each group a key of its own, even when a Conversation comes back further down", () => {
    const groups = groupResults([result(9, "g1"), result(7, "d1"), result(6, "g1")], conversations, ME);
    expect(new Set(groups.map((group) => group.key)).size).toBe(3);
  });

  it("names a Conversation that is not in the loaded list plainly rather than dropping its results", () => {
    const groups = groupResults([result(5, "unknown")], conversations, ME);
    expect(groups).toEqual([{ key: "unknown:m5", conversationId: "unknown", title: "Conversation", results: [result(5, "unknown")] }]);
  });

  it("has no groups for no results", () => {
    expect(groupResults([], conversations, ME)).toEqual([]);
  });
});
