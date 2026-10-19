import { client } from "./generated/client.gen";
import { ApiProblem, asProblem, problemFrom } from "./problem";

export * as sdk from "./generated/sdk.gen";
export * from "./generated/types.gen";
export * from "./generated/@tanstack/react-query.gen";
export { ApiProblem, NETWORK_FAILURE } from "./problem";

/** The one place the backend's address is configured. The browser calls it directly (see ADR 0003). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

let accessToken: () => string | undefined = () => undefined;

/** The session module says where the current access token lives; until then calls go out unauthenticated. */
export function setAccessTokenProvider(provider: () => string | undefined) {
  accessToken = provider;
}

client.setConfig({ baseUrl: API_URL, credentials: "include", auth: () => accessToken() });

/** Every failed call, from the generated SDK and from the generated query and mutation helpers, throws an `ApiProblem`. */
client.interceptors.error.use((error, response) => asProblem(error, response));

/** TanStack Query's errors are the app's problems, so `error` is an `ApiProblem` wherever a query or mutation reports one. */
declare module "@tanstack/react-query" {
  interface Register {
    defaultError: ApiProblem;
  }
}

/** Any error as an {@link ApiProblem}; the interceptor makes every failed call one, so anything else is a bug and reads as a server error. */
export function toProblem(error: unknown): ApiProblem {
  return error instanceof ApiProblem ? error : problemFrom(undefined, 500, new Headers());
}
