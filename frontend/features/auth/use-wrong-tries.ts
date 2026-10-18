"use client";

import { useState } from "react";
import type { ApiProblem } from "@/lib/api";
import { refusedCodeMessage } from "./wording";
import { afterWrongCode, NO_WRONG_TRIES } from "./wrong-tries";

/** Counts refused codes per address for a screen that asks for one, and words what to tell the person. */
export function useWrongTries() {
  const [tries, setTries] = useState(NO_WRONG_TRIES);
  return {
    /** A code was refused for this address: counts it and returns what to tell the person. */
    refused(email: string, problem: ApiProblem): string {
      const next = afterWrongCode(tries, email);
      setTries(next);
      return refusedCodeMessage(next, problem);
    },
    /** A new code was sent: the count starts again. */
    reset: () => setTries(NO_WRONG_TRIES),
  };
}
