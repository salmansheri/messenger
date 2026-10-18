package dev.salman.backend.support;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/** The system clock plus an adjustable offset, so tests can jump past token lifetimes without sleeping. */
public class MutableClock extends Clock {

	private volatile Duration offset = Duration.ZERO;

	public void advance(Duration duration) {
		offset = offset.plus(duration);
	}

	public void reset() {
		offset = Duration.ZERO;
	}

	@Override
	public ZoneId getZone() {
		return ZoneOffset.UTC;
	}

	@Override
	public Clock withZone(ZoneId zone) {
		return this;
	}

	@Override
	public Instant instant() {
		return Instant.now().plus(offset);
	}

}
