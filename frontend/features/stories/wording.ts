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
