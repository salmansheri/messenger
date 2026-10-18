package dev.salman.backend.lib;

import dev.salman.backend.dto.RealtimeEvent;

/** Hands an event to every server instance (which then pushes it to its own connected sockets). */
public interface RealtimePublisher {

	void publish(RealtimeEvent event);

}
