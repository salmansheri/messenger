import { defaultPaginationKeywords, defineConfig } from "@hey-api/openapi-ts";

/**
 * Generated from the running backend: `bun run api`. The output is committed, so a contract change shows as a diff.
 * Calls throw on failure (the app's error interceptor turns that into an `ApiProblem`), and the TanStack Query plugin
 * writes the query keys, query options, infinite query options and mutations for every endpoint. `beforeSeq` is the
 * history's paging parameter, which the generator does not recognise by itself.
 */
export default defineConfig({
  input: `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080"}/v3/api-docs`,
  output: { path: "lib/api/generated" },
  parser: { pagination: { keywords: [...defaultPaginationKeywords, "beforeSeq"] } },
  plugins: [
    { name: "@hey-api/client-fetch", throwOnError: true },
    "@hey-api/typescript",
    "@hey-api/sdk",
    { name: "@tanstack/react-query", queryKeys: true, queryOptions: true, infiniteQueryOptions: true, mutationOptions: true },
  ],
});
