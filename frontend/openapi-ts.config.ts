import { defineConfig } from "@hey-api/openapi-ts";

/** Generated from the running backend: `bun run api`. The output is committed, so a contract change shows as a diff. */
export default defineConfig({
  input: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/v3/api-docs`,
  output: { path: "lib/api/generated" },
  plugins: ["@hey-api/client-fetch", "@hey-api/typescript", "@hey-api/sdk"],
});
