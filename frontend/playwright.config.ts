import { defineConfig, devices } from "@playwright/test";

export const FRONTEND_URL = "http://localhost:3001";
export const BACKEND_URL = "http://localhost:8080";
export const MAILPIT_URL = "http://localhost:8025";

/**
 * End-to-end tests drive the real app in a real browser against the real backend stack (Postgres, Redis, RabbitMQ and
 * Mailpit from the backend's compose file). Servers already running are reused. The backend's per-address and per-IP
 * throttles are raised so a whole suite from one machine never trips them; tests use unique emails, so data may pile up.
 */
export default defineConfig({
  testDir: "./e2e",
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
      command: "bun dev -p 3001",
      url: FRONTEND_URL,
      reuseExistingServer: true,
      timeout: 120_000,
      env: { NEXT_PUBLIC_API_URL: BACKEND_URL },
    },
  ],
});
