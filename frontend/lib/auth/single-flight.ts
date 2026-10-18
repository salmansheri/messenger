/**
 * Wraps work so that callers who ask while it is already running share that one run (and its result or failure)
 * instead of starting their own. Once it finishes, the next caller starts fresh work.
 */
export function singleFlight<T>(work: () => Promise<T>): () => Promise<T> {
  let inFlight: Promise<T> | null = null;
  return () => {
    inFlight ??= work().finally(() => {
      inFlight = null;
    });
    return inFlight;
  };
}
