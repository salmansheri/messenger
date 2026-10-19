import type { MessageResponse } from "@/lib/api";

/** How far everyone else in a Conversation has got: the highest `seq` all of them have received and have read. */
export type Frontier = { deliveredUpTo: number; readUpTo: number };

type Status = NonNullable<MessageResponse["status"]>;
const RANK: Record<Status, number> = { SENT: 0, DELIVERED: 1, READ: 2 };

/** Frontiers only move forward: a late or repeated report never takes anything back. */
export function mergeFrontier(known: Frontier | undefined, reported: Frontier): Frontier {
  return {
    deliveredUpTo: Math.max(known?.deliveredUpTo ?? 0, reported.deliveredUpTo),
    readUpTo: Math.max(known?.readUpTo ?? 0, reported.readUpTo),
  };
}

/**
 * The mark for a Message the person sent: what the server said when it was loaded, or what the frontier shows by
 * now, whichever is further along. (Events about progress can arrive before the Message itself, so the frontier is
 * kept apart from the Messages and applied when they are shown.)
 */
export function statusFor(message: MessageResponse, frontier: Frontier | undefined): Status {
  const seq = message.seq ?? 0;
  const known: Status = message.status ?? "SENT";
  const reached: Status =
    frontier && seq <= frontier.readUpTo ? "READ" : frontier && seq <= frontier.deliveredUpTo ? "DELIVERED" : "SENT";
  return RANK[reached] > RANK[known] ? reached : known;
}
