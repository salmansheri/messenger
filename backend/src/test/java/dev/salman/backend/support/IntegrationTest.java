package dev.salman.backend.support;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.test.web.servlet.MockMvc;

import dev.salman.backend.TestcontainersConfiguration;

/**
 * Base for tests at the single agreed seam: the running application's public interface, backed by real
 * Postgres, Redis and RabbitMQ. Only email and push delivery are replaced with recording fakes.
 */
@SpringBootTest
@AutoConfigureMockMvc
@Import({ TestcontainersConfiguration.class, TestHarnessConfiguration.class })
public abstract class IntegrationTest {

	@Autowired
	protected MockMvc mvc;

	@Autowired
	protected RecordingEmailSender emails;

	@Autowired
	protected RecordingNotificationSender pushes;

}
