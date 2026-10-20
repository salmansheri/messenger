package dev.salman.backend.dto;

import java.util.UUID;

/**
 * What a reply shows of the Message it answers, as one viewer sees it, read when the reply is fetched. {@code text}
 * is the start of the quoted Message as it is now (an edit shows through); a Message deleted for everyone has
 * {@code deleted} and no text; a Message from before the viewer joined is {@code unavailable} and shows neither text
 * nor sender, because they may not read anything from before they joined.
 */
public record ReplyQuote(UUID messageId, UUID senderId, String text, boolean deleted, boolean unavailable) {
}
