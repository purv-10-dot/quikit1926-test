"use client";

import {
  MutationCache,
  QueryCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { useState, type ReactNode } from "react";
import { ToastProvider, useToast, extractErrorDetails } from "@/components/hrms/toast";
import { DialogProvider } from "@/components/hrms/dialog";
import { ApiError } from "@/lib/hooks/use-api";

// next-auth's client doesn't know about Next's basePath — without this it
// fetches /api/auth/session at the domain root, which returns an HTML page
// under a basePath deploy (e.g. /core on UAT) and throws CLIENT_FETCH_ERROR
// ("Unexpected token '<'"). NEXT_PUBLIC_* is inlined at build time, so this
// stays the default "/api/auth" when no basePath is set (local dev).
const AUTH_BASE_PATH = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/api/auth`;

export function Providers({ children }: { children: ReactNode }) {
  return (
    <SessionProvider basePath={AUTH_BASE_PATH}>
      <ToastProvider>
        <DialogProvider>
          <QueryLayer>{children}</QueryLayer>
        </DialogProvider>
      </ToastProvider>
    </SessionProvider>
  );
}

function QueryLayer({ children }: { children: ReactNode }) {
  const toast = useToast();

  const [queryClient] = useState(() => {
    const showError = (err: unknown, fallback: string) => {
      // Aborted/cancelled requests (navigation, supersede) aren't real errors —
      // never toast for them.
      if (err instanceof DOMException && err.name === "AbortError") return;
      if (err instanceof Error && err.name === "AbortError") return;
      if (err instanceof ApiError) {
        toast.error(fallback, err.message, err.details as Parameters<typeof toast.error>[2]);
        return;
      }
      const { message, details } = extractErrorDetails(err);
      toast.error(fallback, message, details);
    };

    return new QueryClient({
      defaultOptions: {
        queries: {
          // Server-load defaults:
          // - Default 60 s staleTime so quick remounts don't refire requests.
          //   For longer-lived data (settings, roles, leave types) override
          //   per-query with `staleTime: getStaleTime(queryKey)` from
          //   lib/query-config.ts.
          staleTime: 60_000,
          gcTime: 10 * 60_000,
          retry: 1,
          // Disabled: window focus + reconnect were firing dozens of refetches
          // per tab switch. Re-enable per-query only when truly needed.
          refetchOnWindowFocus: false,
          refetchOnReconnect: false,
          // Honors staleTime, so only refires when data is actually stale.
          refetchOnMount: true,
        },
        mutations: { retry: 0 },
      },
      queryCache: new QueryCache({
        // Queries can opt out of the global toast (e.g. when the page renders its
        // own inline error UI) by setting meta: { suppressGlobalError: true }.
        onError: (err, query) => {
          if (query.meta?.suppressGlobalError) return;
          showError(err, "Failed to load data");
        },
      }),
      mutationCache: new MutationCache({
        onError: (err) => showError(err, "Action failed"),
      }),
    });
  });

  // TanStack's QueryClientProvider resolves children prop against the root-hoisted
  // @types/react@18 (still pinned by other workspace apps), while this file resolves
  // ReactNode against the quikhrms-local @types/react@19. `unknown` bridges the gap.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <QueryClientProvider client={queryClient}>{children as any}</QueryClientProvider>;
}
