# Running in production

The backend ships as the image built from `backend/Dockerfile` (Render or any Docker host). It listens on 8080, turns compose support off, and keeps uploads under `/app/data/uploads`. Everything else comes from environment variables (Spring's relaxed binding: `app.otp.secret` is `APP_OTP_SECRET`). The defaults in `application.yaml` are for development only.

- **Must set:**
  - **Database:** `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD`. PostgreSQL 15 or later, and the user must be able to create the `unaccent` extension (migration `V16`).
  - **Redis and RabbitMQ:** `SPRING_DATA_REDIS_URL` (e.g. `rediss://user:pass@host:6379`) and `SPRING_RABBITMQ_ADDRESSES` (e.g. `amqps://user:pass@host/vhost`).
  - **Mail:** `SPRING_MAIL_HOST`, `SPRING_MAIL_PORT`, `SPRING_MAIL_USERNAME`, `SPRING_MAIL_PASSWORD`, plus `SPRING_MAIL_PROPERTIES_MAIL_SMTP_AUTH=true` and `SPRING_MAIL_PROPERTIES_MAIL_SMTP_STARTTLS_ENABLE=true` as the provider needs, and `APP_MAIL_FROM`.
  - **JWT keys:** `APP_JWT_PRIVATE_KEY` and `APP_JWT_PUBLIC_KEY`, PEM, EC P-256.
    - Generate them with `openssl ecparam -genkey -name prime256v1 -noout | openssl pkcs8 -topk8 -nocrypt > private.pem` and `openssl ec -in private.pem -pubout > public.pem`.
    - Without them every restart signs with a new key, which signs everyone out within 15 minutes.
  - **Secrets:**
    - `APP_OTP_SECRET`, the HMAC for verification codes.
    - `STORAGE_SIGNING_SECRET` for image links. Changing it breaks the links already handed out.
  - **URLs:**
    - `STORAGE_PUBLIC_BASE_URL`: the backend's public `https://` address, which goes into image links.
    - `APP_CORS_ALLOWED_ORIGINS`: the frontend's origin, comma-separated if there are several.
  - **Client IP:** `SERVER_FORWARD_HEADERS_STRATEGY=native`.
    - Behind a proxy (Render's included) the remote address is otherwise the proxy's, so the per-IP code limit (20 an hour) is shared by every user at once.
    - Tomcat then takes the client from `X-Forwarded-For`, trusting only private-range proxies.
- **Storage:**
  - Mount a persistent disk at `/app/data`, or uploads and Avatars are lost on every deploy.
  - Several instances need the same disk (a network disk), as described under Image uploads.
- **Cookies:**
  - The refresh cookie is `Secure; SameSite=Strict`, so the frontend and backend must be served over HTTPS from the **same site**, e.g. `app.example.com` and `api.example.com`.
  - Two `*.onrender.com` addresses are different sites, because `onrender.com` is on the Public Suffix List. On them the cookie is never sent, and nobody stays signed in after a reload.
  - Leave `REFRESH_COOKIE_SECURE` at its default `true`.
- **Telemetry:** the OpenTelemetry starter exports traces, metrics and logs over OTLP to `localhost`.
  - With a collector, set `MANAGEMENT_OPENTELEMETRY_TRACING_EXPORT_OTLP_ENDPOINT`, `MANAGEMENT_OPENTELEMETRY_LOGGING_EXPORT_OTLP_ENDPOINT` and `MANAGEMENT_OTLP_METRICS_EXPORT_URL`.
  - Without one, turn export off: `MANAGEMENT_TRACING_EXPORT_ENABLED=false`, `MANAGEMENT_OTLP_METRICS_EXPORT_ENABLED=false`, `MANAGEMENT_OTLP_LOGGING_EXPORT_ENABLED=false`. Otherwise the logs fill with failed exports.
- **Optional:** `FCM_CREDENTIALS_FILE`, the path to a Firebase service-account file mounted as a secret file. Without it, pushes are only logged.
- **Frontend:** `NEXT_PUBLIC_API_URL` is inlined into the bundle **at build time**, so set it to the backend's public address before `bun run build`, not at run time.
