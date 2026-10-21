import { describe, expect, it } from "vitest";
import { MATCH_END, MATCH_START, parseSnippet } from "./snippet";

const marked = (word: string) => `${MATCH_START}${word}${MATCH_END}`;

describe("parseSnippet", () => {
  it("splits the server's snippet into plain and matched parts", () => {
    expect(parseSnippet(`Meet at the ${marked("Café")} tomorrow`)).toEqual([
      { text: "Meet at the ", match: false },
      { text: "Café", match: true },
      { text: " tomorrow", match: false },
    ]);
  });

  it("handles several matches, a match at either end and a text that is all match", () => {
    expect(parseSnippet(`${marked("meet")} and ${marked("meeting")}`)).toEqual([
      { text: "meet", match: true },
      { text: " and ", match: false },
      { text: "meeting", match: true },
    ]);
    expect(parseSnippet(marked("hello"))).toEqual([{ text: "hello", match: true }]);
  });

  it("gives plain text as one plain part, and nothing for nothing", () => {
    expect(parseSnippet("no marks here")).toEqual([{ text: "no marks here", match: false }]);
    expect(parseSnippet("")).toEqual([]);
    expect(parseSnippet(undefined)).toEqual([]);
  });

  it("keeps markup as the text it is: a snippet is never HTML", () => {
    expect(parseSnippet(`<b>${marked("<img src=x onerror=alert(1)>")}</b>`)).toEqual([
      { text: "<b>", match: false },
      { text: "<img src=x onerror=alert(1)>", match: true },
      { text: "</b>", match: false },
    ]);
  });

  it("copes with marks that do not pair up, never showing a marker character", () => {
    expect(parseSnippet(`an ${MATCH_START}open mark`)).toEqual([
      { text: "an ", match: false },
      { text: "open mark", match: true },
    ]);
    expect(parseSnippet(`a stray${MATCH_END} end`)).toEqual([{ text: "a stray end", match: false }]);
    expect(parseSnippet(`${MATCH_START}${MATCH_START}twice${MATCH_END}${MATCH_END}`)).toEqual([{ text: "twice", match: true }]);
  });

  it("keeps line breaks, which the view shows as spaces", () => {
    expect(parseSnippet(`Line one\nline two with a ${marked("needle")}`)).toEqual([
      { text: "Line one\nline two with a ", match: false },
      { text: "needle", match: true },
    ]);
  });
});
