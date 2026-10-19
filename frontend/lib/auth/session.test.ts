import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSession, renewalDelayMs, type Tokens } from "./session";

const minutes = (n: number) => n * 60_000;
const tokens = (accessToken: string, expiresInSeconds = 900): Tokens => ({ accessToken, expiresInSeconds });

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("renewalDelayMs", () => {
  it("renews a minute before a 15-minute token runs out", () => {
    expect(renewalDelayMs(900)).toBe(minutes(14));
  });

  it("renews short-lived tokens after 80% of their life, never at once", () => {
    expect(renewalDelayMs(60)).toBe(48_000);
    expect(renewalDelayMs(10)).toBe(8_000);
    expect(renewalDelayMs(0)).toBeGreaterThan(0);
  });
});

describe("a session", () => {
  it("starts signed out of nothing: loading until the first silent refresh answers", async () => {
    const requestTokens = vi.fn().mockResolvedValue(tokens("one"));
    const session = createSession({ requestTokens });
    expect(session.getSnapshot()).toEqual({ status: "loading" });

    await session.start();

    expect(session.getSnapshot()).toEqual({ status: "signedIn" });
    expect(session.token()).toBe("one");
    expect(requestTokens).toHaveBeenCalledTimes(1);
  });

  it("is signed out, with nothing to explain, when there is no session to resume", async () => {
    const session = createSession({ requestTokens: vi.fn().mockRejectedValue(new Error("401")) });

    await session.start();

    expect(session.getSnapshot()).toEqual({ status: "signedOut", ended: false, left: false });
    expect(session.token()).toBeUndefined();
  });

  it("shares one refresh between simultaneous requests, such as everything a page asks for after a reload", async () => {
    let release!: (value: Tokens) => void;
    const requestTokens = vi.fn(() => new Promise<Tokens>((resolve) => (release = resolve)));
    const session = createSession({ requestTokens });

    const refreshes = [session.refresh(), session.refresh(), session.refresh(), session.start(), session.refresh()];
    release(tokens("shared"));
    await Promise.all(refreshes);

    expect(requestTokens).toHaveBeenCalledTimes(1);
    expect(session.token()).toBe("shared");
  });

  it("renews itself before the token runs out, again and again", async () => {
    const requestTokens = vi
      .fn()
      .mockResolvedValueOnce(tokens("first"))
      .mockResolvedValueOnce(tokens("second"))
      .mockResolvedValueOnce(tokens("third"));
    const session = createSession({ requestTokens });
    await session.start();

    await vi.advanceTimersByTimeAsync(minutes(13));
    expect(requestTokens).toHaveBeenCalledTimes(1);
    expect(session.token()).toBe("first");

    await vi.advanceTimersByTimeAsync(minutes(1));
    expect(session.token()).toBe("second");
    await vi.advanceTimersByTimeAsync(minutes(14));
    expect(session.token()).toBe("third");
    expect(session.getSnapshot()).toEqual({ status: "signedIn" });
  });

  it("signs out with an explanation when a renewal fails", async () => {
    const requestTokens = vi.fn().mockResolvedValueOnce(tokens("first")).mockRejectedValue(new Error("401"));
    const session = createSession({ requestTokens });
    await session.start();

    await vi.advanceTimersByTimeAsync(minutes(14));

    expect(session.getSnapshot()).toEqual({ status: "signedOut", ended: true, left: false });
    expect(session.token()).toBeUndefined();
  });

  it("never hands out a token that has run out", async () => {
    const session = createSession({ requestTokens: vi.fn() });
    session.signedIn(tokens("short", 30));

    expect(session.token()).toBe("short");
    vi.setSystemTime(Date.now() + 31_000);
    expect(session.token()).toBeUndefined();
  });

  it("takes the tokens from a sign-in and starts renewing them", async () => {
    const requestTokens = vi.fn().mockResolvedValue(tokens("renewed"));
    const session = createSession({ requestTokens });

    session.signedIn(tokens("login"));
    expect(session.getSnapshot()).toEqual({ status: "signedIn" });
    expect(session.token()).toBe("login");
    await vi.advanceTimersByTimeAsync(minutes(14));

    expect(session.token()).toBe("renewed");
    expect(requestTokens).toHaveBeenCalledTimes(1);
  });

  it("does not run two renewal timers when signing in over an existing session", async () => {
    const requestTokens = vi.fn().mockResolvedValue(tokens("renewed"));
    const session = createSession({ requestTokens });
    session.signedIn(tokens("one"));
    await vi.advanceTimersByTimeAsync(minutes(5));
    session.signedIn(tokens("two"));

    await vi.advanceTimersByTimeAsync(minutes(10)); // 15 minutes after the first, 10 after the second

    expect(requestTokens).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(minutes(4));
    expect(requestTokens).toHaveBeenCalledTimes(1);
  });

  it("stops renewing when the person signs out, and records that they left on purpose", async () => {
    const requestTokens = vi.fn().mockResolvedValue(tokens("renewed"));
    const session = createSession({ requestTokens });
    session.signedIn(tokens("login"));

    session.end();
    await vi.advanceTimersByTimeAsync(minutes(30));

    expect(requestTokens).not.toHaveBeenCalled();
    expect(session.getSnapshot()).toEqual({ status: "signedOut", ended: false, left: true });
    expect(session.token()).toBeUndefined();
  });

  it("tells subscribers about changes, with a snapshot that stays the same object while nothing changed", async () => {
    const session = createSession({ requestTokens: vi.fn().mockResolvedValue(tokens("one")) });
    const listener = vi.fn();
    const unsubscribe = session.subscribe(listener);
    const before = session.getSnapshot();
    expect(session.getSnapshot()).toBe(before);

    await session.start();
    expect(listener).toHaveBeenCalled();
    const after = session.getSnapshot();
    expect(after).not.toBe(before);
    expect(session.getSnapshot()).toBe(after);

    unsubscribe();
    listener.mockClear();
    session.end();
    expect(listener).not.toHaveBeenCalled();
  });

  it("tells listeners each time the token is replaced, so a connection can be reopened with the new one", async () => {
    const requestTokens = vi.fn().mockResolvedValueOnce(tokens("one")).mockResolvedValueOnce(tokens("two"));
    const session = createSession({ requestTokens });
    const seen: (string | undefined)[] = [];
    const stop = session.onTokenReplaced(() => seen.push(session.token()));

    await session.start();
    await vi.advanceTimersByTimeAsync(minutes(14));
    stop();
    session.signedIn(tokens("three"));

    expect(seen, "the new token is already in place when listeners hear").toEqual(["one", "two"]);
  });

  it("lets a failed refresh be tried again later", async () => {
    const requestTokens = vi.fn().mockRejectedValueOnce(new Error("down")).mockResolvedValueOnce(tokens("back"));
    const session = createSession({ requestTokens });

    expect(await session.refresh()).toBe(false);
    expect(await session.refresh()).toBe(true);
    expect(session.token()).toBe("back");
  });
});
