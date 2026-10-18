package dev.salman.backend.support;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.function.Predicate;

import java.nio.charset.StandardCharsets;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageHeaders;
import org.springframework.messaging.converter.AbstractMessageConverter;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaders;
import org.springframework.messaging.simp.stomp.StompSession;
import org.springframework.messaging.simp.stomp.StompSessionHandlerAdapter;
import org.springframework.scheduling.concurrent.ThreadPoolTaskScheduler;
import org.springframework.util.MimeTypeUtils;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.messaging.WebSocketStompClient;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** A real STOMP-over-WebSocket client for tests; collects what the server pushes as parsed JSON. */
public class StompTestClient implements AutoCloseable {

	public static final String EVENTS = "/user/queue/events";
	public static final String ERRORS = "/user/queue/errors";

	private final JsonMapper json;
	private final WebSocketStompClient client;
	private final ThreadPoolTaskScheduler scheduler = new ThreadPoolTaskScheduler();
	private final CompletableFuture<StompSession> connected = new CompletableFuture<>();
	private final CompletableFuture<String> refused = new CompletableFuture<>();
	private final BlockingQueue<JsonNode> received = new LinkedBlockingQueue<>();
	private final List<JsonNode> history = new ArrayList<>();

	private StompSession session;

	private StompTestClient(JsonMapper json) {
		this.json = json;
		scheduler.setPoolSize(1);
		scheduler.initialize();
		client = new WebSocketStompClient(new StandardWebSocketClient());
		client.setMessageConverter(new RawStringConverter());
		client.setTaskScheduler(scheduler);
		client.setDefaultHeartbeat(new long[] { 0, 0 });
	}

	/** Opens a connection and sends CONNECT with the given token (or none when null). Never throws on refusal. */
	public static StompTestClient connect(int port, String accessToken, JsonMapper json) {
		var stomp = new StompTestClient(json);
		var connectHeaders = new StompHeaders();
		if (accessToken != null) {
			connectHeaders.add("Authorization", "Bearer " + accessToken);
		}
		stomp.client.connectAsync("ws://localhost:" + port + "/ws", new WebSocketHttpHeaders(), connectHeaders,
				stomp.new Handler());
		return stomp;
	}

	private class Handler extends StompSessionHandlerAdapter {

		@Override
		public void afterConnected(StompSession connectedSession, StompHeaders connectedHeaders) {
			session = connectedSession;
			connected.complete(connectedSession);
		}

		@Override
		public Type getPayloadType(StompHeaders headers) {
			return String.class;
		}

		@Override
		public void handleFrame(StompHeaders headers, Object payload) {
			refused.complete("ERROR frame: " + headers.getFirst("message"));
		}

		@Override
		public void handleException(StompSession failed, StompCommand command, StompHeaders headers, byte[] payload,
				Throwable exception) {
			refused.complete("exception: " + exception.getMessage());
		}

		@Override
		public void handleTransportError(StompSession failed, Throwable exception) {
			refused.complete("transport: " + exception.getMessage());
		}

	}

	/** True when the server accepted CONNECT; false when it refused or closed the connection first. */
	public boolean awaitConnected() throws Exception {
		for (int i = 0; i < 100; i++) {
			if (connected.isDone()) {
				return true;
			}
			if (refused.isDone()) {
				return false;
			}
			Thread.sleep(50);
		}
		throw new AssertionError("Neither connected nor refused within 5 seconds");
	}

	/** True when the server has refused the connection or a frame, or closed the connection. */
	public boolean awaitRefused() throws Exception {
		try {
			refused.get(5, TimeUnit.SECONDS);
			return true;
		}
		catch (java.util.concurrent.TimeoutException e) {
			return false;
		}
	}

	public String refusal() {
		return refused.getNow(null);
	}

	/**
	 * Subscribes. Spring's in-memory broker sends no RECEIPT, so there is nothing to wait on here: callers prove the
	 * subscription is live by getting a probe event through (see RealtimeTests.listening).
	 */
	public void subscribe(String destination) throws Exception {
		if (!awaitConnected()) {
			throw new AssertionError("Not connected: " + refusal());
		}
		session.subscribe(destination, new StompSessionHandlerAdapter() {
			@Override
			public Type getPayloadType(StompHeaders headers) {
				return String.class;
			}

			@Override
			public void handleFrame(StompHeaders headers, Object payload) {
				var node = json.readTree((String) payload);
				synchronized (history) {
					history.add(node);
				}
				received.add(node);
			}
		});
	}

	/** Sends the payload as JSON, the way a real client would. */
	public void send(String destination, Object payload) throws Exception {
		var headers = new StompHeaders();
		headers.setDestination(destination);
		headers.setContentType(MimeTypeUtils.APPLICATION_JSON);
		session.send(headers, json.writeValueAsString(payload));
	}

	/** The next pushed event matching the predicate, or an AssertionError after five seconds. */
	public JsonNode await(Predicate<JsonNode> matches) throws Exception {
		var deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
		while (System.nanoTime() < deadline) {
			var next = received.poll(100, TimeUnit.MILLISECONDS);
			if (next != null && matches.test(next)) {
				return next;
			}
		}
		throw new AssertionError("No matching event within 5 seconds; saw " + history());
	}

	public JsonNode awaitType(String type) throws Exception {
		return await(e -> type.equals(e.path("type").asString()));
	}

	/** True when nothing matching arrives within the given time (for "must not receive" checks). */
	public boolean receivesNothingMatching(Predicate<JsonNode> matches, long millis) throws Exception {
		var deadline = System.nanoTime() + TimeUnit.MILLISECONDS.toNanos(millis);
		while (System.nanoTime() < deadline) {
			var next = received.poll(50, TimeUnit.MILLISECONDS);
			if (next != null && matches.test(next)) {
				return false;
			}
		}
		return true;
	}

	public List<JsonNode> history() {
		synchronized (history) {
			return List.copyOf(history);
		}
	}

	@Override
	public void close() {
		try {
			if (session != null && session.isConnected()) {
				session.disconnect();
			}
		}
		catch (RuntimeException alreadyClosedByTheServer) {
			// the server may have closed the socket first (that is often the point of the test)
		}
		finally {
			client.stop();
			scheduler.shutdown();
		}
	}

	/** Passes text through whatever its content type; the stock StringMessageConverter only accepts text/plain. */
	private static final class RawStringConverter extends AbstractMessageConverter {

		RawStringConverter() {
			super(MimeTypeUtils.ALL);
		}

		@Override
		protected boolean supports(Class<?> clazz) {
			return String.class == clazz;
		}

		@Override
		protected boolean supportsMimeType(MessageHeaders headers) {
			return true;
		}

		@Override
		protected Object convertFromInternal(Message<?> message, Class<?> targetClass, Object hint) {
			var payload = message.getPayload();
			return payload instanceof byte[] bytes ? new String(bytes, StandardCharsets.UTF_8) : payload.toString();
		}

		@Override
		protected Object convertToInternal(Object payload, MessageHeaders headers, Object hint) {
			return ((String) payload).getBytes(StandardCharsets.UTF_8);
		}

	}

}
