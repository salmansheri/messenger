package dev.salman.backend.dto;

import jakarta.validation.constraints.Min;

/** The latest Sequence numbers the caller has received and/or read; either may be left out, not both. */
public record ReceiptRequest(@Min(0) Long deliveredSeq, @Min(0) Long readSeq) {
}
