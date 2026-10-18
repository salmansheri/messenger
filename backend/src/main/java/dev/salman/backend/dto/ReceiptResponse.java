package dev.salman.backend.dto;

/** The caller's positions after the report (never lower than before) and what is left unread. */
public record ReceiptResponse(long deliveredSeq, long readSeq, long unreadCount) {
}
