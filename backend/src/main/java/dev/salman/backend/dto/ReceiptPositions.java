package dev.salman.backend.dto;

/** A Participant's delivered and read positions at a moment, as Sequence numbers. */
public record ReceiptPositions(long deliveredSeq, long readSeq) {
}
