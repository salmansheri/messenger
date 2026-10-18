package dev.salman.backend.support;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.AfterEach;
import org.springframework.amqp.core.FanoutExchange;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.ResultActions;

import dev.salman.backend.lib.StompSessions;
import dev.salman.backend.support.AuthClient.Account;
import tools.jackson.databind.JsonNode;

/** Shared plumbing for tests that hold real STOMP sockets open. */
public abstract class RealtimeIntegrationTest extends IntegrationTest {

	@Autowired
	protected StompSessions sessions;

	@Autowired
	protected RabbitTemplate rabbit;

	@Autowired
	protected FanoutExchange realtimeExchange;

	protected final List<StompTestClient> open = new ArrayList<>();

	@AfterEach
	void closeSockets() {
		open.forEach(StompTestClient::close);
	}

	/** A connected client already subscribed to its event and error queues, and proven to be receiving. */
	protected StompTestClient listening(Account who) throws Exception {
		var socket = StompTestClient.connect(port, who.accessToken(), json);
		open.add(socket);
		assertThat(socket.awaitConnected()).as("connected: " + socket.refusal()).isTrue();
		socket.subscribe(StompTestClient.EVENTS);
		socket.subscribe(StompTestClient.ERRORS);
		awaitLive(socket, who);
		return socket;
	}

	/**
	 * Spring's in-memory broker registers a subscription asynchronously and sends no receipt, so keep publishing a
	 * probe through RabbitMQ (the real path) until this socket gets one: from then on it is really listening.
	 */
	protected void awaitLive(StompTestClient socket, Account who) throws Exception {
		var probe = Map.of("recipients", List.of(who.id()), "payload", Map.of("type", "probe"));
		for (int attempt = 0; attempt < 40; attempt++) {
			rabbit.convertAndSend(realtimeExchange.getName(), "", json.writeValueAsString(probe));
			if (!socket.receivesNothingMatching(e -> "probe".equals(e.path("type").asString()), 250)) {
				return;
			}
		}
		throw new AssertionError("The socket never became ready: " + socket.refusal());
	}

	protected String idOf(ResultActions result) throws Exception {
		return json.readTree(result.andReturn().getResponse().getContentAsString()).get("id").asString();
	}

	protected static boolean isType(JsonNode event, String type, String conversationId) {
		return type.equals(event.path("type").asString())
				&& conversationId.equals(event.path("conversationId").asString());
	}

}
