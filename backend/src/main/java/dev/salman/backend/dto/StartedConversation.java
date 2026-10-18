package dev.salman.backend.dto;

/** The outcome of starting a Direct conversation: {@code created} is false when it already existed. */
public record StartedConversation(ConversationResponse conversation, boolean created) {
}
