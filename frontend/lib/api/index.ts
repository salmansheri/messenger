import { client } from "./generated/client.gen";
import { ApiProblem, NETWORK_FAILURE, problemFrom } from "./problem";

export * as sdk from "./generated/sdk.gen";
export * from "./generated/types.gen";
export { ApiProblem, NETWORK_FAILURE } from "./problem";

/** The one place the backend's address is configured. The browser calls it directly (see ADR 0003). */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

let accessToken: () => string | undefined = () => undefined;

/** The session module says where the current access token lives; until then calls go out unauthenticated. */
export function setAccessTokenProvider(provider: () => string | undefined) {
  accessToken = provider;
}

client.setConfig({ baseUrl: API_URL, credentials: "include", auth: () => accessToken() });

/** Any error as an {@link ApiProblem}; `call` only throws those, so anything else is a bug and reads as a server error. */
export function toProblem(error: unknown): ApiProblem {
  return error instanceof ApiProblem ? error : problemFrom(undefined, 500, new Headers());
}

type Result<T> = { data?: T; error?: unknown; response?: Response };

/** Awaits an SDK call and returns its data, or throws an {@link ApiProblem} for any failure, including no answer. */
export async function call<T>(request: Promise<Result<T>>): Promise<T> {
  let result: Result<T>;
  try {
    result = await request;
  } catch {
    throw problemFrom(undefined, NETWORK_FAILURE, new Headers());
  }
  const { response } = result;
  if (!response) throw problemFrom(undefined, NETWORK_FAILURE, new Headers());
  if (result.error !== undefined || !response.ok) {
    throw problemFrom(result.error, response.status, response.headers);
  }
  return result.data as T;
}
