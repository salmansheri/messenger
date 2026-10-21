/** The first `characters` characters of the text (counted as people count them, an emoji is one), with an ellipsis if it was cut. */
export function firstCharacters(text: string, characters: number): string {
  const all = [...text];
  return all.length <= characters ? text : `${all.slice(0, characters).join("")}…`;
}

/**
 * A short line about a Message for places that show only a glimpse (a reply's quote, the Conversation list), worded as
 * the server words it for pushes and quotes: the start of the text, or for an image "Photo" and, when it has a caption,
 * "Photo: " and the start of the caption.
 */
export function glimpse(body: string | null | undefined, hasImage: boolean, characters: number): string {
  const text = (body ?? "").replace(/\s+/g, " ").trim();
  if (!hasImage) return firstCharacters(text, characters);
  return text ? `Photo: ${firstCharacters(text, characters)}` : "Photo";
}
