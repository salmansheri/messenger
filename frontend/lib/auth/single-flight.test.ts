import { describe, expect, it, vi } from "vitest";
import { singleFlight } from "./single-flight";

const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((res, rej) => ((resolve = res), (reject = rej)));
  return { promise, resolve, reject };
};

describe("singleFlight", () => {
  it("runs the work once however many callers ask while it is in progress", async () => {
    const work = deferred<string>();
    const run = vi.fn(() => work.promise);
    const once = singleFlight(run);

    const callers = [once(), once(), once(), once(), once()];
    expect(run).toHaveBeenCalledTimes(1);
    work.resolve("token");

    expect(await Promise.all(callers)).toEqual(["token", "token", "token", "token", "token"]);
  });

  it("starts fresh work for the next caller once the last has finished", async () => {
    const run = vi.fn().mockResolvedValueOnce("first").mockResolvedValueOnce("second");
    const once = singleFlight(run);

    expect(await once()).toBe("first");
    expect(await once()).toBe("second");
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("gives every waiting caller the same failure, then allows a new try", async () => {
    const failure = new Error("nope");
    const run = vi.fn().mockRejectedValueOnce(failure).mockResolvedValueOnce("recovered");
    const once = singleFlight(run);

    const callers = [once(), once(), once()];
    const outcomes = await Promise.allSettled(callers);

    expect(outcomes.map((o) => o.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(run).toHaveBeenCalledTimes(1);
    expect(await once()).toBe("recovered");
  });
});
