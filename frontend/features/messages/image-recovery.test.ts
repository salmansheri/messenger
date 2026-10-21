import { describe, expect, it } from "vitest";
import { initialImageState, nextImageState, type ImageAction, type ImageState } from "./image-recovery";

const run = (actions: ImageAction[], from: ImageState = initialImageState) => actions.reduce(nextImageState, from);

describe("recovering a picture whose link has expired", () => {
  it("asks for fresh links once, silently, when a picture fails to load", () => {
    expect(run([{ type: "error", canRefresh: true }])).toEqual({ status: "refreshing", refreshed: true });
  });

  it("shows the picture again when the fresh link arrives", () => {
    expect(run([{ type: "error", canRefresh: true }, { type: "refreshed", changed: true }])).toEqual({ status: "showing", refreshed: true });
  });

  it("gives up with the placeholder when the fresh link loads no better", () => {
    const state = run([{ type: "error", canRefresh: true }, { type: "refreshed", changed: true }, { type: "error", canRefresh: true }]);
    expect(state.status).toBe("failed");
  });

  it("gives up when asking for fresh links brought the same link back", () => {
    expect(run([{ type: "error", canRefresh: true }, { type: "refreshed", changed: false }]).status).toBe("failed");
  });

  it("goes straight to the placeholder when there is no way to refresh", () => {
    expect(run([{ type: "error", canRefresh: false }]).status).toBe("failed");
  });

  it("ignores a second report of the same failure while the links are being fetched", () => {
    const refreshing = run([{ type: "error", canRefresh: true }]);
    expect(nextImageState(refreshing, { type: "error", canRefresh: true })).toBe(refreshing);
  });

  it("ignores a late answer about the links once the picture is already showing or given up", () => {
    const showing = run([{ type: "error", canRefresh: true }, { type: "refreshed", changed: true }]);
    expect(nextImageState(showing, { type: "refreshed", changed: false })).toBe(showing);
    const failed = run([{ type: "error", canRefresh: false }]);
    expect(nextImageState(failed, { type: "refreshed", changed: false })).toBe(failed);
  });

  it("shows the picture again when a fresh link turns up after the wait had already given up", () => {
    const failed = run([{ type: "error", canRefresh: true }, { type: "refreshed", changed: false }]);
    expect(nextImageState(failed, { type: "refreshed", changed: true })).toEqual({ status: "showing", refreshed: true });
  });

  it("recovers again from a later expiry once the picture has loaded", () => {
    const state = run([
      { type: "error", canRefresh: true },
      { type: "refreshed", changed: true },
      { type: "loaded" },
      { type: "error", canRefresh: true },
    ]);
    expect(state).toEqual({ status: "refreshing", refreshed: true });
  });

  it("tries once more with fresh links when Retry is pressed, and returns to the placeholder if that fails too", () => {
    const failed = run([{ type: "error", canRefresh: true }, { type: "refreshed", changed: false }]);
    const retrying = nextImageState(failed, { type: "retry", canRefresh: true });
    expect(retrying).toEqual({ status: "refreshing", refreshed: true });
    expect(run([{ type: "refreshed", changed: true }, { type: "error", canRefresh: true }], retrying).status).toBe("failed");
  });

  it("just tries the same picture again on Retry when there is no way to refresh", () => {
    const failed = run([{ type: "error", canRefresh: false }]);
    expect(nextImageState(failed, { type: "retry", canRefresh: false }).status).toBe("showing");
  });

  it("ignores Retry when nothing has failed", () => {
    expect(nextImageState(initialImageState, { type: "retry", canRefresh: true })).toBe(initialImageState);
  });
});
