package dev.salman.backend.support;

import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CopyOnWriteArraySet;
import java.util.concurrent.atomic.AtomicInteger;

import org.springframework.amqp.AmqpException;

import dev.salman.backend.dto.PushDelivery;
import dev.salman.backend.dto.PushJob;
import dev.salman.backend.lib.AmqpPushPublisher;
import dev.salman.backend.lib.PushPublisher;

/** The real push publisher, with switches to make publishing to the broker fail the way a broker outage would. */
public class FaultyPushPublisher implements PushPublisher {

	private final AmqpPushPublisher real;
	private final AtomicInteger deliverCalls = new AtomicInteger();
	private final Set<Integer> failingDeliverCalls = new CopyOnWriteArraySet<>();
	private volatile boolean failingRetries;

	public FaultyPushPublisher(AmqpPushPublisher real) {
		this.real = real;
	}

	/** Makes these calls (1-based, counted from now) of {@link #deliver} fail. */
	public void failDeliverCalls(int... callNumbers) {
		deliverCalls.set(0);
		for (var n : callNumbers) {
			failingDeliverCalls.add(n);
		}
	}

	/** Makes every {@link #deliver} call fail. */
	public void failAllDeliveries() {
		for (int i = 1; i <= 1_000; i++) {
			failingDeliverCalls.add(i);
		}
		deliverCalls.set(0);
	}

	/** Makes {@link #retryLater} fail. */
	public void failRetries() {
		failingRetries = true;
	}

	public void reset() {
		failingDeliverCalls.clear();
		deliverCalls.set(0);
		failingRetries = false;
	}

	@Override
	public void messageStored(UUID messageId) {
		real.messageStored(messageId);
	}

	@Override
	public void fanOutLater(PushJob job) {
		real.fanOutLater(job);
	}

	@Override
	public void deliver(PushDelivery delivery) {
		if (failingDeliverCalls.contains(deliverCalls.incrementAndGet())) {
			throw new AmqpException("broker down");
		}
		real.deliver(delivery);
	}

	@Override
	public void retryLater(PushDelivery delivery) {
		if (failingRetries) {
			throw new AmqpException("broker down");
		}
		real.retryLater(delivery);
	}

	@Override
	public void bury(PushJob job) {
		real.bury(job);
	}

	@Override
	public void bury(PushDelivery delivery) {
		real.bury(delivery);
	}

}
