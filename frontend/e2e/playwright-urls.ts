/**
 * Where the stack lives. Shared by the Playwright config and every test helper. The frontend the tests use has its own
 * port (3002, not the development server's 3001) so a development server that is started, stopped or restarted
 * while the suite runs cannot break it.
 */
export const FRONTEND_URL = "http://localhost:3002";
export const BACKEND_URL = "http://localhost:8080";
export const MAILPIT_URL = "http://localhost:8025";
