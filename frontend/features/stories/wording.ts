import type { ApiProblem } from "@/lib/api";
import { sendFailureMessage } from "@/features/messages/wording";

/** What a photo Story says to a screen reader: who posted it and its caption. */
export function photoAlternative(poster: string, caption: string | undefined): string {
  return caption ? `Photo by ${poster}: ${caption}` : `Photo by ${poster}`;
}

/**
 * What the viewer says as each Story comes up: whose it is, which of how many, and when it was posted ("14:02",
 * "Yesterday": the list's own time wording).
 */
export function storySummary(story: { own: boolean; name: string; index: number; count: number; when: string }): string {
  const whose = story.own ? "Your Story" : `${story.name}'s Story`;
  return `${whose}, ${story.index + 1} of ${story.count}, posted ${story.when}`;
}

/** How many people saw one of your Stories, as the viewer shows it on your own. */
export function seenByText(count: number): string {
  return `Seen by ${count}`;
}

/** The reply box's placeholder on someone's Story: their first name, as under their tray entry. */
export function replyPlaceholder(name: string | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Reply to ${first}…` : "Reply…";
}

/**
 * Why a reply to a Story was not sent: a 404 means the Story has gone (expired, deleted, or the poster is out of reach);
 * everything else is worded as for any send (the throttle with its wait, a Block in the server's words).
 */
export function storyReplyFailureMessage(problem: ApiProblem): string {
  if (problem.status === 404) return "This Story is no longer there.";
  return sendFailureMessage(problem);
}
