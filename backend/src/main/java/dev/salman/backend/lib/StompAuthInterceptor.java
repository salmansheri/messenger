package dev.salman.backend.lib;

import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.messaging.Message;
import org.springframework.messaging.MessageChannel;
import org.springframework.messaging.MessagingException;
import org.springframework.messaging.simp.stomp.StompCommand;
import org.springframework.messaging.simp.stomp.StompHeaderAccessor;
import org.springframework.messaging.support.ChannelInterceptor;
import org.springframework.messaging.support.MessageHeaderAccessor;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.stereotype.Component;

import dev.salman.backend.entity.User;
import dev.salman.backend.repository.UserRepository;
import lombok.RequiredArgsConstructor;

/**
 * The gatekeeper for everything a client sends over a socket. CONNECT must carry a valid access token for a User who
 * still exists. After that a client may only listen on its own event and error queues and only send receipt
 * reports and typing notices; anything else, or anything after the token has expired, is refused and the socket is closed.
 */
@Component
@RequiredArgsConstructor
public class StompAuthInterceptor implements ChannelInterceptor {

	private static final String BEARER = "Bearer ";
	private static final Set<String> LISTENABLE = Set.of("/user/queue/events", "/user/queue/errors");
	private static final Pattern RECEIPTS = Pattern.compile("^/app/conversations/[0-9a-fA-F-]{36}/(receipts|typing)$");

	private final JwtDecoder jwtDecoder;
	private final UserRepository users;
	private final StompSessions sessions;

	@Override
	public Message<?> preSend(Message<?> message, MessageChannel channel) {
		var accessor = MessageHeaderAccessor.getAccessor(message, StompHeaderAccessor.class);
		if (accessor == null || accessor.getCommand() == null) {
			return message; // heartbeat
		}
		var command = accessor.getCommand();
		if (command == StompCommand.CONNECT || command == StompCommand.STOMP) {
			authenticate(accessor);
			return message;
		}
		if (command == StompCommand.DISCONNECT || command == StompCommand.UNSUBSCRIBE) {
			return message;
		}
		requireLiveSession(accessor);
		if (command == StompCommand.SUBSCRIBE && !LISTENABLE.contains(accessor.getDestination())) {
			throw refuse(accessor, "You may only listen on your own event and error queues.");
		}
		if (command == StompCommand.SEND && !isAllowedSend(accessor.getDestination())) {
			throw refuse(accessor, "You may only send receipt reports and typing notices.");
		}
		if (command != StompCommand.SUBSCRIBE && command != StompCommand.SEND) {
			throw refuse(accessor, command + " is not supported.");
		}
		return message;
	}

	private void authenticate(StompHeaderAccessor accessor) {
		if (sessions.isAuthenticated(accessor.getSessionId())) {
			throw refuse(accessor, "This connection is already authenticated.");
		}
		var header = accessor.getFirstNativeHeader("Authorization");
		if (header == null || !header.startsWith(BEARER)) {
			throw refuse(accessor, "An access token is required.");
		}
		try {
			var jwt = jwtDecoder.decode(header.substring(BEARER.length()).strip());
			var userId = UUID.fromString(jwt.getSubject());
			if (jwt.getExpiresAt() == null || !users.findById(userId).filter(User::isEmailVerified).isPresent()) {
				throw refuse(accessor, "The user no longer exists.");
			}
			sessions.authenticated(accessor.getSessionId(), userId.toString(), jwt.getExpiresAt());
			accessor.setUser(new StompUser(userId.toString()));
		}
		catch (MessagingException e) {
			throw e;
		}
		catch (RuntimeException e) { // a bad signature, expiry, a missing claim: whatever it is, not authenticated
			throw refuse(accessor, "The access token is not valid.");
		}
	}

	private void requireLiveSession(StompHeaderAccessor accessor) {
		if (accessor.getUser() == null || !sessions.isLive(accessor.getSessionId())) {
			throw refuse(accessor, "Not authenticated, or the access token has expired.");
		}
	}

	private static boolean isAllowedSend(String destination) {
		return destination != null && RECEIPTS.matcher(destination).matches();
	}

	private MessagingException refuse(StompHeaderAccessor accessor, String reason) {
		if (accessor.getSessionId() != null) {
			sessions.closeSoon(accessor.getSessionId());
		}
		return new MessagingException(reason);
	}

}
