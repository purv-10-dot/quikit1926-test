"use client";

import { SessionProvider } from "next-auth/react";
import {
  MutationCache,
  QueryClient,
  QueryClientProvider,
} from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { ConfirmProvider } from "@quikit/ui";
import { Toaster } from "@/components/Toaster";
import {
  areToastsSuppressed,
  isSilentMutation,
  resolveErrorMessage,
  resolveSuccessMessage,
  toast,
} from "@/lib/toast";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
            // Don't retry client errors (401/403/404/422) — retrying a
            // doomed request (e.g. a non-admin hitting an admin-only
            // endpoint) just hammers the server "again and again". Retry
            // server/network errors once, in case the DB was briefly cold.
            retry: (failureCount, error) => {
              const status = (error as { status?: number })?.status;
              if (typeof status === "number" && status >= 400 && status < 500) {
                return false;
              }
              return failureCount < 1;
            },
          },
        },
        // A batch caller (bulk import) opens a suppression scope so N rows
        // don't stack N identical toasts — it reports one summary instead.
        // Errors are suppressed with it: the batch itemises its own row
        // failures, so the per-row toasts would be duplicate noise too.
        mutationCache: new MutationCache({
          onSuccess: (_data, _vars, _ctx, mutation) => {
            if (areToastsSuppressed()) return;
            if (isSilentMutation(mutation.options.meta)) return;
            toast.success(resolveSuccessMessage(mutation.options.meta));
          },
          onError: (error, _vars, _ctx, mutation) => {
            if (areToastsSuppressed()) return;
            if (isSilentMutation(mutation.options.meta)) return;
            toast.error(resolveErrorMessage(mutation.options.meta, error));
          },
        }),
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ConfirmProvider>
          {children}
          <Toaster />
        </ConfirmProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
