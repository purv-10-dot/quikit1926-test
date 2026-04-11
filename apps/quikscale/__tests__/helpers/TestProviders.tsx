import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

/**
 * Wraps children in a fresh QueryClient so React Query hooks work in tests.
 * Each test gets its own client so cache state doesn't leak.
 */
export function TestProviders({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, staleTime: Infinity },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
