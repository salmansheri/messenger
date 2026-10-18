# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A WhatsApp-style messenger app, as a monorepo with one git repo at the root. Domain language lives in `GLOSSARY.md`; the backend plan is GitHub issue #1 with tickets #2-#13 (see Agent skills below). The frontend is still a fresh scaffold; the backend is being built ticket by ticket.

- `backend/` — Spring Boot 4.1.x, Java 25, Maven (package `dev.salman.backend`)
- `frontend/` — Next.js 16 (App Router), React 19, Tailwind 4, TypeScript, Bun

## Backend commands (run from `backend/`)

```bash
./mvnw spring-boot:run                                  # run the app
./mvnw test                                             # all tests
./mvnw test -Dtest=BackendApplicationTests#contextLoads # single test
./mvnw package                                          # build jar
```

- `spring-boot-docker-compose` is on the classpath, so `spring-boot:run` auto-starts `compose.yaml` (Postgres, Redis, RabbitMQ, Mailpit, Grafana LGTM for OpenTelemetry). Postgres/Redis/RabbitMQ use random host ports and Spring wires them automatically; don't hardcode their URLs in dev. Mailpit is fixed at SMTP `1025` (app default) and web UI `http://localhost:8025`. Grafana is on host `3000`.
- A stale Postgres volume from an earlier run can cause `password authentication failed for user "myuser"`; `docker compose down -v` in `backend/` fixes it.
- Tests sit at one seam: the running app's public interface. Extend `support.IntegrationTest` (MockMvc, real Postgres/Redis/RabbitMQ via `TestcontainersConfiguration`). Only email and push are faked: use the `emails` and `pushes` recording senders it exposes (e.g. read a Verification code from `emails.latestTo(...)`). Run the app against test containers via the `TestBackendApplication` main class.
- Schema is managed by Flyway (`spring-boot-starter-flyway`); put migrations in `src/main/resources/db/migration`. Note that JPA is also present, so don't rely on Hibernate DDL auto-generation.
- `application.yaml` is currently minimal (only the app name).

## Frontend commands (run from `frontend/`)

```bash
bun dev      # dev server (Turbopack)
bun run build
bun run lint # eslint; there is no test runner configured yet
```

- **Next.js 16 has breaking changes from older versions.** `frontend/AGENTS.md` requires reading the relevant guide in `frontend/node_modules/next/dist/docs/` before writing Next.js code. Heed deprecation notices.
- The root `.mcp.json` registers `next-devtools-mcp`; use it for Next.js runtime/docs queries when available.
- Port clash: the Grafana LGTM container in the backend compose file maps host port `3000`, the same as `next dev`'s default. Start one with a different port (e.g. `bun dev -p 3001`).

## Architecture notes

Backend design (partly implemented; see issue #1 for the full spec):

- REST via `spring-boot-starter-webmvc` plus OpenAPI/Swagger UI (`springdoc-openapi`).
- Realtime messaging via `spring-boot-starter-websocket`; RabbitMQ (`amqp`) and Redis are intended for cross-instance fan-out, presence, and async work.
- Security: stateless Spring Security. Public paths are `/api/v1/auth/**`, health/info, and OpenAPI/Swagger; everything else needs a bearer JWT. Security failures are written as problem+json by `ProblemSecurityHandlers`. JWT issuing/validation (self-issued ES256) arrives with ticket #4; there is no OAuth2 client.
- Errors: all errors are RFC 9457 problem details. Spring MVC exceptions go through `GlobalExceptionHandler`; add domain exception handlers there.
- Outbound ports `EmailSender` and `NotificationSender` live in `lib`; real implementations are SMTP and (later) FCM.
- PostgreSQL is the primary store (JPA + Flyway); Lombok and MapStruct are wired via a single `annotationProcessorPaths` list in the `maven-compiler-plugin` configuration in `pom.xml` (with `lombok-mapstruct-binding`). Add any new annotation processors there. Packages are by technical layer under `dev.salman.backend`.
- Observability: OpenTelemetry starter exporting to the LGTM container.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`salmansheri/messenger`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
