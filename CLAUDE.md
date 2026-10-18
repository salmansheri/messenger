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
- Tests sit at one seam: the running app's public interface. Extend `support.IntegrationTest` (MockMvc, real Postgres/Redis/RabbitMQ via `TestcontainersConfiguration`). Only email and push are faked: use the `emails` and `pushes` recording senders it exposes (e.g. read a Verification code from `emails.latestTo(...)`). `IntegrationTest.auth()` returns an `AuthClient` that drives the auth endpoints (refresh token passed and read as a cookie) from a unique client IP (so rate limits never leak between tests) and reads codes from the recorded emails. The test context uses a 4-second code TTL (`app.otp.ttl`), so code-expiry tests sleep just over 4s; token expiry is tested by moving the `MutableClock` (`clock.advance(...)`, reset before each test). Run the app against test containers via the `TestBackendApplication` main class.
- Schema is managed by Flyway (`spring-boot-starter-flyway`); put migrations in `src/main/resources/db/migration`. Note that JPA is also present, so don't rely on Hibernate DDL auto-generation.
- `application.yaml` holds JPA validation, virtual threads, problem details, mail host/port, and the `app.*` settings bound by `AppProperties` (JWT and OTP values are placeholders until tickets #3-#4).

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
- Security: stateless Spring Security. Public paths are `/api/v1/auth/**`, health/info, and OpenAPI/Swagger; everything else needs a bearer JWT. Security failures are written as problem+json by `ProblemSecurityHandlers`. JWTs are self-issued (ES256, `JwtConfig`; the signing key comes from `app.jwt.private-key`/`public-key` PEMs, or an ephemeral key is generated with a warning) and validated by the resource-server filter; there is no OAuth2 client. `Clock` is a bean (`JwtConfig`) so tests can move time.
- Errors: all errors are RFC 9457 problem details with `title`, `status`, `detail`, `instance` (no `type` while it is the default). Validation failures add an `errors` map of field to message; unexpected exceptions become a generic 500. All of this lives in `GlobalExceptionHandler`; add domain exception handlers there. Security failures use the same shape via `ProblemSecurityHandlers`. Test-only `ErrorProbeController` (test classpath) exercises these paths.
- Outbound ports `EmailSender` and `NotificationSender` live in `lib`; real implementations are SMTP and (later) FCM.
- PostgreSQL is the primary store (JPA + Flyway); Lombok and MapStruct are wired via a single `annotationProcessorPaths` list in the `maven-compiler-plugin` configuration in `pom.xml` (with `lombok-mapstruct-binding`). Add any new annotation processors there. Packages are by technical layer under `dev.salman.backend` (`controller`, `service`, `repository`, `entity`, `dto`, `exception`, `config`, `lib`). **Every service is an interface in `service` with its implementation named `*Impl` in `service/impl`**; controllers and other services depend on the interface.
- Auth so far (`/api/v1/auth`): `POST signup` (202), `POST verify-email` (204), `POST resend-verification` (204). Verification codes live in Redis as an HMAC with a TTL; wrong attempts are counted per code (5 max) and sends are rate-limited per email and per client IP (fixed 1-hour window, 429 with `Retry-After`). Domain failures extend `ApiException` (an `ErrorResponseException`), which the framework renders as problem+json. Emails are normalized (trimmed, lower-cased) in the request records via `Emails.normalize`. Reuse the composed constraints `@ValidEmail`, `@ValidPassword` (8-72 characters and at most 72 UTF-8 bytes because of BCrypt) and `@ValidVerificationCode` on request fields.
- Password reset (`/api/v1/auth`): `POST forgot-password` (204 for any email; only verified Users are actually emailed; counts against the same hourly send limits as sign-up) and `POST reset-password` (`email`, `code`, `newPassword`; 204). Reset codes use their own `Purpose.PASSWORD_RESET` key space in `VerificationCodeService`, so they are not interchangeable with email-verification codes. A successful reset hashes the new password first, then (holding the User row lock) consumes the code, changes the password and deletes every refresh-token family in one transaction; already-issued access tokens stay valid until they expire. **Sign-in, refresh and reset all take `UserRepository.findBy...ForUpdate`**, so a session can never be created from a password a concurrent reset just replaced; keep taking that lock in any new code that creates sessions or changes credentials. Code emails are sent on the `mailExecutor` (virtual threads) and failures are only logged, so responses and timing never reveal whether an address has an account; tests swap in a same-thread executor and can make sends fail with `emails.failFor(address)`.
- User lookup: `POST /api/v1/users/lookup` with `{"email": ...}` (authenticated; POST so the address stays out of URLs and logs) returns `{id, displayName}` for an exact, case-insensitive match of a verified User and a 404 problem with an identical body for everything else (unknown, unverified, partial, wildcard). It is deliberately not a search; other Users never see an email or verification state, and the request deliberately skips `@ValidEmail` so odd input is a miss, not a different error. Each call, found or not, counts against a per-caller allowance (`app.lookup.max-per-minute`, default 30; 429 with `Retry-After`). Throttling goes through the shared `RateLimiter` service (fixed window, one Lua script); use it for any new limit. A Flyway check constraint refuses stored emails containing A-Z, so keep normalizing in code before every write.
- Conversations (`/api/v1/conversations`): `POST direct` with `{"userId"}` starts a Direct conversation with a verified User and returns 201, or 200 with the same body if the pair already has one (whoever starts it); yourself is a 400, an unknown or unverified User a 404. `GET` lists the caller's Conversations, most recently active (`updated_at`) first, with their participants' ids, display names and roles. Schema (`V3`): `conversation` (type DIRECT/GROUP, `direct_key` = both User ids sorted and joined by `:`, unique and required exactly for DIRECT, `last_seq` for message ordering, `updated_at` for list order) and `participant` (unique per conversation and user). Creating a Direct conversation takes a transaction-scoped Postgres advisory lock on the key (`ConversationRepository.lockDirectKey`), so concurrent creators serialise; the unique constraint is only the backstop. Responses are built with three queries per list, not per conversation. `lastMessage` is the latest Message (null until one is sent); the unread count arrives with receipts (#10).
- Messages (`/api/v1/conversations/{id}/messages`, see `docs/adr/0001-server-assigned-message-sequence.md`): `POST` `{clientMessageId, body}` (body validated by `@ValidMessageBody`: not blank, at most 4000 characters counted as Unicode code points like the database check, no NUL; stored exactly as sent) returns 201 with the stored Message `{id, conversationId, seq, senderId, clientMessageId, body, createdAt}`, or 200 with the same Message when that sender already used the `clientMessageId` in that conversation with the same text (409 if the text differs). `seq` comes from `conversation.last_seq`, incremented while holding `ConversationRepository.findByIdForUpdate`, so it is gap-free and concurrent sends and retries serialise per conversation; keep that lock for anything that writes Messages. `GET` returns `{messages, hasMore}` in ascending `seq`: newest `limit` (default 50, max 100) by default, `beforeSeq` pages back, `afterSeq` catches up (not both). A non-participant and an unknown conversation get the same 404. Message `createdAt`/`updated_at` use the microsecond `Clock` bean (Postgres precision) so a value reads back exactly as written. Sending moves the conversation to the top of the list by bumping `updated_at`. Row locks never wait forever: `spring.datasource.hikari.connection-init-sql` sets `lock_timeout` (5s; tests use 1.5s), and a wait that times out becomes a 503 problem with `Retry-After` in `GlobalExceptionHandler`. The history endpoint checks membership before anything else, so a non-participant only ever sees the uniform 404. Not done yet: per-participant visibility from the join point (needs groups, #9; membership should also be re-checked under the lock once participants can be removed), a send throttle and a request-body size cap.
- Sessions (`/api/v1/auth`): `POST login` (200 with `accessToken`, `tokenType`, `expiresIn` in the body; 401 for unknown email or wrong password with an identical message, 403 only when the password is right but the email is unverified), `POST refresh`, `POST logout` (204, idempotent), and `GET /api/v1/users/me`. Access tokens last 15 minutes and are stateless (they stay valid after logout until they expire, and only `/users/me` re-checks the user exists). **The refresh token is never in a response body**: it is an `HttpOnly; Secure; SameSite=Strict; Path=/api/v1/auth` cookie named `refresh_token` (`RefreshCookies`; `app.refresh-cookie.secure` can be false for plain-HTTP dev). `/refresh` and `/logout` read it from the cookie (no request body), a rotated cookie is set on every refresh, and a failed refresh or any logout clears it. Refresh tokens are opaque, single-use, stored as SHA-256, grouped in a family per login; using a used one deletes its family (transaction uses `noRollbackFor = ApiException`); logout deletes the family. Used/expired refresh rows are not yet purged. CSRF protection stays disabled because endpoints authenticate with the bearer header; the cookie is protected by SameSite=Strict plus `CorsConfig`, which rejects cross-origin requests from any origin not in `app.cors.allowed-origins` (default `http://localhost:3000`). Requests with no `Origin` header (mobile apps, curl) are allowed.
- Observability: OpenTelemetry starter exporting to the LGTM container.

## Agent skills

### Issue tracker

Issues live in GitHub Issues (`salmansheri/messenger`), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.
