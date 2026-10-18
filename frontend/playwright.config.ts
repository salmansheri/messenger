import { defineConfig, devices } from "@playwright/test";

import { BACKEND_URL, FRONTEND_URL } from "./e2e/playwright-urls";

/**
 * End-to-end tests drive the real app in a real browser against the real backend stack (Postgres, Redis, RabbitMQ and
 * Mailpit from the backend's compose file). Servers already running are reused. The backend's per-address and per-IP
 * throttles are raised so a whole suite from one machine never trips them; tests use unique emails, so data may pile up.
 */
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: FRONTEND_URL, trace: "retain-on-failure" },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
    { name: "phone", use: { ...devices["Pixel 7"] } },
  ],
  webServer: [
    {
      command: "./mvnw spring-boot:run",
      cwd: "../backend",
      url: `${BACKEND_URL}/actuator/health`,
      reuseExistingServer: true,
      timeout: 300_000,
      env: {
        APP_OTP_MAX_SENDS_PER_HOUR: "100000",
        APP_OTP_MAX_SENDS_PER_IP_PER_HOUR: "100000",
        APP_LOOKUP_MAX_PER_MINUTE: "100000",
        APP_GROUPS_MAX_CREATED_PER_HOUR: "100000",
      },
    },
    {
      command: "bun dev",
      url: FRONTEND_URL,
      reuseExistingServer: true,
      timeout: 120_000,
      env: { NEXT_PUBLIC_API_URL: BACKEND_URL },
    },
  ],
});
