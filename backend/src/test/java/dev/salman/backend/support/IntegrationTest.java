package dev.salman.backend.support;

import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.context.annotation.Import;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import tools.jackson.databind.json.JsonMapper;

import dev.salman.backend.TestcontainersConfiguration;

/**
 * Base for tests at the single agreed seam: the running application's public interface, backed by real
 * Postgres, Redis and RabbitMQ. Only email and push delivery are replaced with recording fakes.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@TestPropertySource(properties = { "app.otp.ttl=4s", "app.presence.offline-grace=1s",
		"spring.datasource.hikari.connection-init-sql=SET lock_timeout = '1500ms'" })
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, TestHarnessConfiguration.class })
public abstract class IntegrationTest {

	@LocalServerPort
	protected int port;

	@Autowired
	protected MockMvc mvc;

	@Autowired
	protected RecordingEmailSender emails;

	@Autowired
	protected RecordingNotificationSender pushes;

	@Autowired
	protected JsonMapper json;

	@Autowired
	protected MutableClock clock;

	@BeforeEach
	void resetClock() {
		clock.reset();
		emails.clearFailures();
	}

	protected AuthClient auth() {
		return new AuthClient(mvc, json, emails);
	}

}
