package dev.salman.backend.service;

import java.util.UUID;

import dev.salman.backend.dto.PushDelivery;
import dev.salman.backend.entity.Message;

/**
 * Push notifications for Users who are away. Storing a Message only queues one small job (after the transaction
 * commits, never failing the send); a worker then works out who is offline and queues one delivery per device, and
 * each delivery is retried later when the provider is temporarily unavailable. Tokens the provider rejects are removed.
 */
public interface PushService {

	/** A Message was stored: once the current transaction commits, queue the job that notifies offline recipients. */
	void messageStored(Message message);

	/** Worker step 1: queue a delivery for every device of every recipient who is not online right now. */
	void fanOut(UUID messageId);

	/** Worker step 2: send one delivery, retrying later on a temporary failure and forgetting rejected tokens. */
	void deliver(PushDelivery delivery);

}
