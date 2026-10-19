import { describe, expect, it } from "vitest";
import { ApiProblem, NETWORK_FAILURE, asProblem, problemFrom } from "./problem";

const headers = (init: Record<string, string> = {}) => new Headers(init);

describe("problemFrom", () => {
  it("reads an RFC 9457 problem with its field errors", () => {
    const problem = problemFrom(
      { title: "Bad Request", status: 400, detail: "Invalid request content.", errors: { email: "must be a valid email" } },
      400,
      headers(),
    );

    expect(problem).toBeInstanceOf(ApiProblem);
    expect(problem.status).toBe(400);
    expect(problem.title).toBe("Bad Request");
    expect(problem.detail).toBe("Invalid request content.");
    expect(problem.errors).toEqual({ email: "must be a valid email" });
    expect(problem.retryAfterSeconds).toBeUndefined();
  });

  it("carries how long to wait from Retry-After on 429 and 503", () => {
    const limited = problemFrom({ title: "Too Many Requests", status: 429 }, 429, headers({ "Retry-After": "120" }));
    expect(limited.retryAfterSeconds).toBe(120);
    expect(problemFrom({}, 503, headers({ "Retry-After": "5" })).retryAfterSeconds).toBe(5);
  });

  it("ignores a Retry-After that is not a number of seconds", () => {
    expect(problemFrom({}, 429, headers({ "Retry-After": "soon" })).retryAfterSeconds).toBeUndefined();
    expect(problemFrom({}, 429, headers({ "Retry-After": "-3" })).retryAfterSeconds).toBeUndefined();
    expect(problemFrom({}, 429, headers({ "Retry-After": "1.5" })).retryAfterSeconds).toBeUndefined();
    expect(problemFrom({}, 429, headers({ "Retry-After": "" })).retryAfterSeconds).toBeUndefined();
    expect(problemFrom({}, 429, headers()).retryAfterSeconds).toBeUndefined();
  });

  it("falls back to the status when the body is not a problem at all", () => {
    for (const body of [undefined, null, "boom", 42, ["x"], { errors: "nope" }]) {
      const problem = problemFrom(body, 500, headers());
      expect(problem.status).toBe(500);
      expect(problem.title).toBe("Something went wrong");
      expect(problem.errors).toEqual({});
    }
  });

  it("reports a failed connection as status 0", () => {
    const problem = problemFrom(undefined, NETWORK_FAILURE, headers());
    expect(problem.status).toBe(0);
    expect(problem.isNetworkFailure).toBe(true);
    expect(problemFrom({}, 500, headers()).isNetworkFailure).toBe(false);
  });

  it("keeps only string field messages", () => {
    const problem = problemFrom({ errors: { name: "is blank", count: 3 } }, 400, headers());
    expect(problem.errors).toEqual({ name: "is blank" });
  });
});

describe("asProblem", () => {
  it("makes a problem from the error body and the answer that came with it", () => {
    const problem = asProblem({ title: "Too Many Requests" }, new Response(null, { status: 429, headers: { "Retry-After": "30" } }));
    expect(problem).toBeInstanceOf(ApiProblem);
    expect(problem.status).toBe(429);
    expect(problem.title).toBe("Too Many Requests");
    expect(problem.retryAfterSeconds).toBe(30);
  });

  it("calls a request that got no answer a network failure, whatever the error was", () => {
    for (const error of [new TypeError("Failed to fetch"), new DOMException("aborted", "AbortError"), undefined]) {
      const problem = asProblem(error, undefined);
      expect(problem.status).toBe(NETWORK_FAILURE);
      expect(problem.isNetworkFailure).toBe(true);
    }
  });

  it("leaves a problem that already is one as it is", () => {
    const problem = problemFrom({ title: "Nope" }, 403, headers());
    expect(asProblem(problem, new Response(null, { status: 500 }))).toBe(problem);
  });
});
