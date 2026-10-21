/** How the server marks a matched word in a snippet (`SearchResult.MATCH_START` / `MATCH_END`, two private-use characters). */
export const MATCH_START = "\uE000";
export const MATCH_END = "\uE001";

/** One run of a snippet: plain text, or a word that matched the search. */
export type SnippetPart = { text: string; match: boolean };

/**
 * A search result's snippet as parts to render as text (a `<mark>` for each match), never as HTML, so nothing in a
 * Message can become markup. Marks that do not pair up are tolerated: an open mark runs to the end, a stray end or a
 * repeated start is dropped, and no marker character is ever shown. Neighbouring parts of the same kind are joined.
 */
export function parseSnippet(snippet: string | undefined): SnippetPart[] {
  const parts: SnippetPart[] = [];
  let match = false;
  let text = "";
  const flush = () => {
    if (!text) return;
    const last = parts.at(-1);
    if (last && last.match === match) last.text += text;
    else parts.push({ text, match });
    text = "";
  };
  for (const char of snippet ?? "") {
    if (char === MATCH_START || char === MATCH_END) {
      const opening = char === MATCH_START;
      if (opening !== match) {
        flush();
        match = opening;
      }
      continue;
    }
    text += char;
  }
  flush();
  return parts;
}
