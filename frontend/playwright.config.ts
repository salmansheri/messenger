import { defineConfig, devices } from "@playwright/test";

import { BACKEND_URL, FRONTEND_URL } from "./e2e/playwright-urls";

/**
 * End-to-end tests drive the real app in a real browser against the real backend stack (Postgres, Redis, RabbitMQ and
 * Mailpit from the backend's compose file). A running frontend dev server is reused; the backend is always started by
 * Playwright (see below). Its per-IP and lookup/group
 * throttles are raised so a whole suite from one machine never trips them; the per-email code limit stays real (5 an
 * hour) because a test exercises it, and tests use unique emails, so data may pile up.
 */
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 3,
  reporter: [["list"]],
  use: { baseURL: FRONTEND_URL, trace: "retain-on-failure" },
  // Every test runs on a desktop and on a phone, in the light and in the dark (the app follows the system by default).
  projects: [
    { name: "desktop-light", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, colorScheme: "light" } },
    { name: "desktop-dark", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 }, colorScheme: "dark" } },
    { name: "phone-light", use: { ...devices["Pixel 7"], colorScheme: "light" } },
    { name: "phone-dark", use: { ...devices["Pixel 7"], colorScheme: "dark" } },
  ],
  webServer: [
    {
      command: "./mvnw spring-boot:run",
      cwd: "../backend",
      url: `${BACKEND_URL}/actuator/health`,
      // Never adopt a backend that is already running: Playwright could not know it has the raised throttles, and the
      // tests would spend its real allowance (and leave data in it). Stop it and let Playwright start its own, or set
      // E2E_REUSE_SERVERS=1 if you started it yourself with the environment variables below.
      reuseExistingServer: process.env.E2E_REUSE_SERVERS === "1",
      timeout: 300_000,
      // A clean shutdown lets Spring stop the compose containers it started; a kill would leave them holding ports.
      gracefulShutdown: { signal: "SIGTERM", timeout: 60_000 },
      env: {
        APP_OTP_MAX_SENDS_PER_IP_PER_HOUR: "100000",
        APP_LOOKUP_MAX_PER_MINUTE: "100000",
        APP_GROUPS_MAX_CREATED_PER_HOUR: "100000",
        // Tests seed long histories through the backend as one User; the throttle itself is shown with an injected 429.
        APP_MESSAGES_MAX_SENDS_PER_MINUTE: "100000",
        APP_MESSAGES_MAX_CHANGES_PER_MINUTE: "100000",
        // The backend answers (and accepts sockets from) the frontend the tests use.
        APP_CORS_ALLOWED_ORIGINS: FRONTEND_URL,
      },
    },
    {
      // The app is built and served on its own port and folder, fresh for every run, so it never depends on (or
      // disturbs) a development server. A development server compiles each page on its first visit, which makes a test
      // that is the first to visit one slow or flaky; E2E_DEV=1 uses one anyway for quick iteration.
      command: process.env.E2E_DEV === "1" ? "bunx next dev -p 3002" : "bun run build && bunx next start -p 3002",
      url: FRONTEND_URL,
      reuseExistingServer: false,
      timeout: 240_000,
      env: { NEXT_PUBLIC_API_URL: BACKEND_URL, NEXT_DIST_DIR: ".next-e2e" },
    },
  ],
});
