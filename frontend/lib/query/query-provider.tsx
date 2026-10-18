"use client";

import { useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * One cache for the whole app. Nothing is retried on its own: a failed call already carries the backend's answer (and
 * for a dropped connection the person can just press the button again), so silent retries would only hide it and
 * could repeat a request that was not safe to repeat.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(
    () => new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 30_000 }, mutations: { retry: false } } }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
