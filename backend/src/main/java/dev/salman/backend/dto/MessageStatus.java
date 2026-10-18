package dev.salman.backend.dto;

/** How far a sender's Message has got: stored, received by every other Participant, or seen by every one. */
public enum MessageStatus {
	SENT, DELIVERED, READ
}
