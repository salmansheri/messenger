import type { MessageResponse, ReplyQuote } from "@/lib/api";
import { firstCharacters, glimpse } from "./glimpse";

/** A quote shows the start of the text, as the server's quotes and push notifications do. */
const QUOTE_CHARACTERS = 100;

export { firstCharacters };

const oneLine = (text: string) => text.replace(/\s+/g, " ").trim();

/** What a quote shows: the start of the text, a Message that was deleted, or nothing at all (the person may not see it). */
export type QuoteView =
  | { kind: "text"; messageId: string | undefined; sender: string; text: string }
  | { kind: "deleted"; messageId: string | undefined; sender: string }
  | { kind: "unavailable"; messageId: string | undefined };

/**
 * How a reply's quote reads. The server's quote is a snapshot taken when the reply was fetched; when the quoted Message
 * is loaded here its own current state wins, so an edit or a deletion shows through at once, with no event about the
 * reply needed. A Message the person may not see (from before they joined, or hidden) shows nothing of itself.
 */
export function quoteView(
  quote: ReplyQuote,
  loaded: (messageId: string | undefined) => MessageResponse | undefined,
  nameOf: (senderId: string | undefined) => string,
): QuoteView {
  const message = loaded(quote.messageId);
  if (message) {
    if (message.deletedAt) return { kind: "deleted", messageId: quote.messageId, sender: nameOf(message.senderId) };
    return {
      kind: "text",
      messageId: quote.messageId,
      sender: nameOf(message.senderId),
      text: glimpse(message.body, Boolean(message.attachment), QUOTE_CHARACTERS),
    };
  }
  if (quote.unavailable) return { kind: "unavailable", messageId: quote.messageId };
  if (quote.deleted) return { kind: "deleted", messageId: quote.messageId, sender: nameOf(quote.senderId) };
  return { kind: "text", messageId: quote.messageId, sender: nameOf(quote.senderId), text: oneLine(quote.text ?? "") };
}

/** The quote of a Message the person chose to reply to, shaped like the server's so the strip and the row share a presenter. */
export function replyDraft(message: MessageResponse): ReplyQuote {
  return {
    messageId: message.id,
    senderId: message.senderId,
    text: glimpse(message.body, Boolean(message.attachment), QUOTE_CHARACTERS),
    deleted: false,
    unavailable: false,
  };
}

/** The reply under way, unless its Message has been deleted meanwhile (the server refuses a reply to a deleted Message). */
export function replyTarget(
  draft: ReplyQuote | undefined,
  loaded: (messageId: string | undefined) => MessageResponse | undefined,
): ReplyQuote | undefined {
  if (!draft) return undefined;
  return loaded(draft.messageId)?.deletedAt ? undefined : draft;
}
