# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

A WhatsApp-style messenger app. The repo root is not a git repo itself; it holds two independent projects (`frontend/` has its own `.git`). Both are currently fresh scaffolds with no app code yet beyond the generated entry points.

- `backend/` — Spring Boot 4.1.x, Java 25, Maven (package `dev.salman.backend`)
- `frontend/` — Next.js 16 (App Router), React 19, Tailwind 4, TypeScript, Bun

## Backend commands (run from `backend/`)

```bash
./mvnw spring-boot:run                                  # run the app
./mvnw test                                             # all tests
./mvnw test -Dtest=BackendApplicationTests#contextLoads # single test
./mvnw package                                          # build jar
```

- `spring-boot-docker-compose` is on the classpath, so `spring-boot:run` auto-starts `compose.yaml` (Postgres, Redis, RabbitMQ, Grafana LGTM for OpenTelemetry). Compose ports are unpublished-host (`'5432'`, etc.), so Docker assigns random host ports and Spring wires the connections automatically. Don't hardcode datasource/Redis/Rabbit URLs in dev.
- Tests use Testcontainers (`TestcontainersConfiguration`, `TestBackendApplication` in `src/test`). Run the app against test containers via the `TestBackendApplication` main class.
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

Backend dependencies indicate the intended design (not yet implemented):

- REST via `spring-boot-starter-webmvc` plus OpenAPI/Swagger UI (`springdoc-openapi`).
- Realtime messaging via `spring-boot-starter-websocket`; RabbitMQ (`amqp`) and Redis are intended for cross-instance fan-out, presence, and async work.
- Security: Spring Security with OAuth2 resource server (JWT) and OAuth2 client.
- PostgreSQL is the primary store (JPA + Flyway); Lombok is enabled via annotation processor paths configured explicitly in the `maven-compiler-plugin` executions in `pom.xml`. Add any new annotation processors (e.g. MapStruct) to those `annotationProcessorPaths` lists.
- Observability: OpenTelemetry starter exporting to the LGTM container.
