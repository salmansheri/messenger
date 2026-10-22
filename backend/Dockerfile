# The backend as a container image (for Render or any Docker host). Configuration comes from environment variables;
# see the production notes in the root CLAUDE.md for the ones that must be set (database, Redis, RabbitMQ, SMTP, keys).

# --- Build: compile and package the jar --------------------------------------------------------------------------
FROM eclipse-temurin:25-jdk AS build
WORKDIR /build

# Dependencies first, so a code change does not download them again.
COPY .mvn .mvn
COPY mvnw pom.xml ./
RUN ./mvnw -q -B dependency:go-offline

COPY src src
# The tests need Testcontainers (Docker inside the build), so they run in CI or locally, not here.
RUN ./mvnw -q -B package -DskipTests

# Split the jar into layers (libraries change less often than our code), for smaller image updates.
RUN java -Djarmode=tools -jar target/*.jar extract --layers --launcher --destination extracted

# --- Run: a JRE only, as an unprivileged user -----------------------------------------------------------------------
FROM eclipse-temurin:25-jre
WORKDIR /app

RUN groupadd --system app && useradd --system --gid app --home-dir /app app \
    && mkdir -p /app/data/uploads && chown -R app:app /app/data

COPY --from=build /build/extracted/dependencies/ ./
COPY --from=build /build/extracted/spring-boot-loader/ ./
COPY --from=build /build/extracted/snapshot-dependencies/ ./
COPY --from=build /build/extracted/application/ ./

# Uploaded images and avatars live here: mount a persistent disk at /app/data, or they are lost on every deploy.
ENV STORAGE_DIRECTORY=/app/data/uploads \
    SERVER_PORT=8080 \
    SPRING_DOCKER_COMPOSE_ENABLED=false

USER app
EXPOSE 8080
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "org.springframework.boot.loader.launch.JarLauncher"]
