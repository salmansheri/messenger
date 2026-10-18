package dev.salman.backend.service;

import dev.salman.backend.dto.PushDelivery;
import dev.salman.backend.dto.PushJob;
import dev.salman.backend.entity.Message;

/**
 * Push notifications for Users who are away. Storing a Message only queues one small job (after the transaction
 * commits, never failing the send); a worker then works out who is offline and queues one delivery per device, and
 * each delivery is retried later when the provider is temporarily unavailable. Work that fails is retried a bounded
 * number of times and then parked on the dead-letter queue. Tokens the provider rejects are removed.
 */
public interface PushService {

	/** A Message was stored: once the current transaction commits, queue the job that notifies offline recipients. */
	void messageStored(Message message);

	/**
	 * Worker step 1: queue a delivery for every device of every recipient who is not online right now, each at most
	 * once per Message. A failure retries the whole job later (devices already queued are skipped the next time).
	 */
	void fanOut(PushJob job);

	/** Worker step 2: send one delivery, retrying later on a temporary failure and forgetting rejected tokens. */
	void deliver(PushDelivery delivery);

}
