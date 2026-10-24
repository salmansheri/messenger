import { describe, expect, it } from "vitest";
import { messageActions } from "./actions";

describe("messageActions", () => {
  it("offers everything on a Message when nobody is blocked: Reply, React, and Edit and Delete for everyone on your own", () => {
    expect(messageActions({ mine: true, deleted: false, blocked: false })).toEqual({
      reply: true,
      react: true,
      edit: true,
      deleteForEveryone: true,
      deleteForMe: true,
    });
    expect(messageActions({ mine: false, deleted: false, blocked: false })).toEqual({
      reply: true,
      react: true,
      edit: false,
      deleteForEveryone: false,
      deleteForMe: true,
    });
  });

  it("offers only Delete for me on a deleted Message", () => {
    expect(messageActions({ mine: true, deleted: true, blocked: false })).toEqual({
      reply: false,
      react: false,
      edit: false,
      deleteForEveryone: false,
      deleteForMe: true,
    });
  });

  it("offers only what the server still allows a blocker: Delete for me, and Delete for everyone on their own", () => {
    expect(messageActions({ mine: true, deleted: false, blocked: true })).toEqual({
      reply: false,
      react: false,
      edit: false,
      deleteForEveryone: true,
      deleteForMe: true,
    });
    expect(messageActions({ mine: false, deleted: false, blocked: true })).toEqual({
      reply: false,
      react: false,
      edit: false,
      deleteForEveryone: false,
      deleteForMe: true,
    });
  });
});
