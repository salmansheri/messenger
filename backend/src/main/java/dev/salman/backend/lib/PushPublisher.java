package dev.salman.backend.lib;

import java.util.UUID;

import dev.salman.backend.dto.PushDelivery;

/** The push work queues. */
public interface PushPublisher {

	/** Queues the job that notifies offline recipients of a stored Message. Never throws: a send must not fail. */
	void messageStored(UUID messageId);

	/** Queues one delivery for the worker. */
	void deliver(PushDelivery delivery);

	/** Queues a delivery to be tried again after the retry delay. */
	void retryLater(PushDelivery delivery);

}
