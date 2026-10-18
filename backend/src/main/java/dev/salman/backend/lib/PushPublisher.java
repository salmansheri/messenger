package dev.salman.backend.lib;

import java.util.UUID;

import dev.salman.backend.dto.PushDelivery;
import dev.salman.backend.dto.PushJob;

/** The push work queues. */
public interface PushPublisher {

	/** Queues the job that notifies offline recipients of a stored Message. Never throws: a send must not fail. */
	void messageStored(UUID messageId);

	/** Queues a job to be tried again after the retry delay. */
	void fanOutLater(PushJob job);

	/** Queues one delivery for the worker. */
	void deliver(PushDelivery delivery);

	/** Queues a delivery to be tried again after the retry delay. */
	void retryLater(PushDelivery delivery);

	/** Parks a job that ran out of attempts on the dead-letter queue, where it can be inspected and replayed. */
	void bury(PushJob job);

	/** Parks a delivery that ran out of attempts (or could not be queued for retry) on the dead-letter queue. */
	void bury(PushDelivery delivery);

}
