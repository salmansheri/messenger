package dev.salman.backend.support;

import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketHttpHeaders;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.client.standard.StandardWebSocketClient;
import org.springframework.web.socket.handler.TextWebSocketHandler;

/** A bare WebSocket that speaks raw STOMP text frames, for sending what a well-behaved client never would. */
public class RawStompSocket implements AutoCloseable {

	private final BlockingQueue<String> frames = new LinkedBlockingQueue<>();
	private final CompletableFuture<Void> closed = new CompletableFuture<>();
	private WebSocketSession session;

	public static RawStompSocket open(int port) throws Exception {
		var socket = new RawStompSocket();
		var headers = new WebSocketHttpHeaders();
		headers.setSecWebSocketProtocol("v12.stomp");
		socket.session = new StandardWebSocketClient().execute(new TextWebSocketHandler() {
			@Override
			protected void handleTextMessage(WebSocketSession session, TextMessage message) {
				socket.frames.add(message.getPayload());
			}

			@Override
			public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
				socket.closed.complete(null);
			}
		}, headers, java.net.URI.create("ws://localhost:" + port + "/ws")).get(5, TimeUnit.SECONDS);
		return socket;
	}

	public void connect(String accessToken) throws Exception {
		send("CONNECT\naccept-version:1.2\nhost:localhost\nAuthorization:Bearer " + accessToken + "\n\n\u0000");
	}

	public void send(String text) throws Exception {
		session.sendMessage(new TextMessage(text));
	}

	/** The next frame whose text starts with the given command, or null after five seconds. */
	public String awaitFrame(String command) throws Exception {
		var deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(5);
		while (System.nanoTime() < deadline) {
			var frame = frames.poll(100, TimeUnit.MILLISECONDS);
			if (frame != null && frame.startsWith(command)) {
				return frame;
			}
		}
		return null;
	}

	public boolean awaitClosed() throws Exception {
		try {
			closed.get(5, TimeUnit.SECONDS);
			return true;
		}
		catch (java.util.concurrent.TimeoutException e) {
			return false;
		}
	}

	public boolean isOpen() {
		return session != null && session.isOpen() && !closed.isDone();
	}

	@Override
	public void close() {
		try {
			if (session != null && session.isOpen()) {
				session.close();
			}
		}
		catch (Exception ignored) {
			// closing is best effort
		}
	}

}
