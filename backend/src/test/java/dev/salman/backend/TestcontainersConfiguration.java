package dev.salman.backend;

import org.springframework.beans.factory.annotation.Qualifier;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.DynamicPropertyRegistrar;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.grafana.LgtmStackContainer;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.rabbitmq.RabbitMQContainer;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.utility.DockerImageName;

@TestConfiguration(proxyBeanMethods = false)
public class TestcontainersConfiguration {

	private static final String ACCESS_KEY = "testaccesskey";
	private static final String SECRET_KEY = "testsecretkey123";

	@Bean
	@ServiceConnection
	LgtmStackContainer grafanaLgtmContainer() {
		return new LgtmStackContainer(DockerImageName.parse("grafana/otel-lgtm:latest"));
	}

	@Bean
	@ServiceConnection
	PostgreSQLContainer postgresContainer() {
		return new PostgreSQLContainer(DockerImageName.parse("postgres:latest"));
	}

	@Bean
	@ServiceConnection
	RabbitMQContainer rabbitContainer() {
		return new RabbitMQContainer(DockerImageName.parse("rabbitmq:latest"));
	}

	@Bean
	@ServiceConnection(name = "redis")
	GenericContainer<?> redisContainer() {
		return new GenericContainer<>(DockerImageName.parse("redis:latest")).withExposedPorts(6379);
	}

	/** An S3-compatible store (RustFS; MinIO no longer publishes images). It validates signed URLs like S3 does. */
	@Bean
	GenericContainer<?> objectStorageContainer() {
		return new GenericContainer<>(DockerImageName.parse("rustfs/rustfs:latest")).withExposedPorts(9000)
				.withEnv("RUSTFS_ACCESS_KEY", ACCESS_KEY).withEnv("RUSTFS_SECRET_KEY", SECRET_KEY)
				.withCommand("/data").waitingFor(Wait.forHttp("/health").forPort(9000));
	}

	/** Points the object storage at the container (it has no Spring Boot service connection). */
	@Bean
	DynamicPropertyRegistrar storageProperties(@Qualifier("objectStorageContainer") GenericContainer<?> storage) {
		return registry -> {
			registry.add("app.storage.endpoint", () -> "http://" + storage.getHost() + ":" + storage.getMappedPort(9000));
			registry.add("app.storage.access-key", () -> ACCESS_KEY);
			registry.add("app.storage.secret-key", () -> SECRET_KEY);
		};
	}

}
