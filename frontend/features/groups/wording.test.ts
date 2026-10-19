import { describe, expect, it } from "vitest";
import { ApiProblem, NETWORK_FAILURE } from "@/lib/api";
import { groupFailure } from "./wording";

const problem = (status: number, detail?: string, retryAfterSeconds?: number) =>
  new ApiProblem(status, "Title", detail, {}, retryAfterSeconds);

describe("groupFailure", () => {
  it("says only Admins can do it when the server refuses a Participant who is not one", () => {
    for (const action of ["rename", "add", "remove", "promote"] as const) {
      expect(groupFailure(problem(403, "Only group admins can do that."), action)).toEqual({
        message: "Only an Admin can change this Group.",
        about: "panel",
      });
    }
  });

  it("tells a person who is already in the Group from a Group that is full", () => {
    expect(groupFailure(problem(409, "That user is already in the group."), "add").message).toBe(
      "That person is already in this Group.",
    );
    expect(groupFailure(problem(409, "The group is full."), "add").message).toBe(
      "This Group is full: it has the most Participants it can have (256).",
    );
  });

  it("says no verified person has an unknown address, the same for unknown and unverified", () => {
    const expected = "No verified user has that email address. Check the spelling, or ask them to sign up and verify it.";
    expect(groupFailure(problem(404, "No user found."), "add")).toEqual({ message: expected, about: "address" });
    expect(groupFailure(problem(404, "No user found."), "create")).toEqual({ message: expected, about: "address" });
  });

  it("says a person is no longer there when they left before the Admin got to them", () => {
    expect(groupFailure(problem(404, "No such participant."), "remove").message).toBe("That person is no longer in this Group.");
    expect(groupFailure(problem(404, "No such participant."), "promote").message).toBe("That person is no longer in this Group.");
  });

  it("says the Group is gone when it cannot be found any more", () => {
    expect(groupFailure(problem(404, "Conversation not found."), "rename").message).toBe("This Group was not found.");
    expect(groupFailure(problem(404), "leave").message).toBe("This Group was not found.");
  });

  it("does not depend on the backend's wording for a 404: what was asked decides what is missing", () => {
    const odd = "Something else entirely.";
    expect(groupFailure(problem(404, odd), "add").about).toBe("address");
    expect(groupFailure(problem(404, odd), "remove").message).toBe("That person is no longer in this Group.");
    expect(groupFailure(problem(404, odd), "rename").message).toBe("This Group was not found.");
  });

  it("uses the general wording for being throttled, a busy server and no connection", () => {
    expect(groupFailure(problem(429, undefined, 300), "create").message).toBe("You are doing that too often. Try again in 5 minutes.");
    expect(groupFailure(problem(NETWORK_FAILURE), "add").message).toContain("Could not reach the server");
    expect(groupFailure(problem(503), "rename").message).toBe("The server is busy. Try again in a moment.");
  });

  it("shows field errors of a refused name under the name", () => {
    const refused = new ApiProblem(400, "Bad Request", "Invalid request content.", { name: "must not be blank" }, undefined);
    expect(groupFailure(refused, "create")).toEqual({ message: "must not be blank", about: "name" });
  });
});
