import type { ApiProblem } from "@/lib/api";
import { messageFor } from "@/lib/api/messages";

export type GroupAction = "create" | "rename" | "add" | "remove" | "promote" | "leave";

/** What to tell the person, and where: under the name or the address when that is the trouble, else in the panel or form. */
export type GroupFailure = { message: string; about: "name" | "address" | "panel" | "form" };

const NOBODY = "No verified user has that email address. Check the spelling, or ask them to sign up and verify it.";

/** Why a Group action was refused, in plain words, from the backend's answer. */
export function groupFailure(problem: ApiProblem, action: GroupAction): GroupFailure {
  if (problem.errors.name) return { message: problem.errors.name, about: "name" };
  if (problem.status === 403) return { message: "Only an Admin can change this Group.", about: "panel" };
  if (problem.status === 409) {
    const full = /full/i.test(problem.detail ?? "");
    return {
      message: full
        ? "This Group is full: it has the most Participants it can have (256)."
        : "That person is already in this Group.",
      about: "address",
    };
  }
  if (problem.status === 404) {
    const detail = problem.detail ?? "";
    if (/participant/i.test(detail)) return { message: "That person is no longer in this Group.", about: "panel" };
    if (/conversation/i.test(detail)) return { message: "This Group was not found.", about: "panel" };
    return { message: NOBODY, about: "address" };
  }
  return { message: messageFor(problem), about: action === "create" ? "form" : action === "add" ? "address" : "panel" };
}
