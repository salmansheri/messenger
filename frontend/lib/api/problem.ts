/** The status given to a request that never got an answer. */
export const NETWORK_FAILURE = 0;

/** A failed API call, from the backend's RFC 9457 problem details (or from the network failing before an answer). */
export class ApiProblem extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail: string | undefined,
    /** Field name to message, for validation failures. */
    readonly errors: Record<string, string>,
    /** From Retry-After on 429 and 503: how long to wait before trying again. */
    readonly retryAfterSeconds: number | undefined,
  ) {
    super(detail ?? title);
  }

  /** The request never got an answer (offline, server down, blocked). */
  get isNetworkFailure() {
    return this.status === NETWORK_FAILURE;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const stringOrUndefined = (value: unknown) => (typeof value === "string" ? value : undefined);

function retryAfter(headers: Headers) {
  const header = headers.get("Retry-After");
  if (header === null || !/^\d+$/.test(header.trim())) return undefined;
  return Number(header);
}

/** Turns whatever the backend (or the network) gave back into an {@link ApiProblem}; it never throws. */
export function problemFrom(body: unknown, status: number, headers: Headers): ApiProblem {
  const problem = isRecord(body) ? body : {};
  const errors: Record<string, string> = {};
  if (isRecord(problem.errors)) {
    for (const [field, message] of Object.entries(problem.errors)) {
      if (typeof message === "string") errors[field] = message;
    }
  }
  return new ApiProblem(
    status,
    stringOrUndefined(problem.title) ?? "Something went wrong",
    stringOrUndefined(problem.detail),
    errors,
    retryAfter(headers),
  );
}
