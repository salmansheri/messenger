package dev.salman.backend.dto;

/** The outcome of a send: {@code created} is false when the Client message ID had already been stored. */
public record SentMessage(MessageResponse message, boolean created) {
}
