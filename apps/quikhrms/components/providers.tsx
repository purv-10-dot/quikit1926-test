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
import { DialogProvider, useDialog } from "@/components/hrms/dialog";
import { ApiError } from "@/lib/hooks/use-api";

// Turn a raw error into a clear, user-facing message. Server internals like
// "Internal server error" / stack-ish text are replaced with friendly wording;
// meaningful messages (conflicts, validation, permission) are kept as-is.
function friendlyActionError(err: unknown): { title: string; description: string } {
  if (err instanceof ApiError) {
    const raw = (err.message ?? "").trim();
    const generic = !raw || /internal server error|unexpected|operation failed/i.test(raw);
    switch (err.status) {
      case 401:
        return { title: "Session expired", description: "Please sign in again to continue." };
      case 403:
        return { title: "Not allowed", description: raw || "You don't have permission to do that." };
      case 404:
        return { title: "Not found", description: raw || "That item no longer exists — it may have been deleted." };
      case 409:
        return { title: "Couldn't complete — conflict", description: raw || "This conflicts with existing data." };
      case 422:
      case 400:
        return { title: "Please check the details", description: raw || "Some information is missing or invalid." };
      case 429:
        return { title: "Too many requests", description: "Please wait a moment and try again." };
      default:
        return {
          title: "Something went wrong",
          description: generic
            ? "We couldn't complete that action. Please try again in a moment."
            : raw,
        };
    }
  }
  const { message } = extractErrorDetails(err);
  const generic = !message || /internal server error|unexpected|failed to fetch|networkerror/i.test(message);
  return {
    title: "Something went wrong",
    description: generic ? "We couldn't complete that action. Please check your connection and try again." : message,
  };
}

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
  const dialog = useDialog();

  const [queryClient] = useState(() => {
    const isAbort = (err: unknown) =>
      (err instanceof DOMException && err.name === "AbortError") ||
      (err instanceof Error && err.name === "AbortError");

    // Failed data LOADS surface as a toast (non-blocking — the page usually
    // shows its own empty/error state alongside).
    const showLoadError = (err: unknown, fallback: string) => {
      if (isAbort(err)) return;
      if (err instanceof ApiError) {
        // A 403 on a page's data query is an expected access-control outcome —
        // the page renders its own no-access state, so don't also toast.
        if (err.status === 403 || err.code === "FORBIDDEN") return;
        toast.error(fallback, err.message, err.details as Parameters<typeof toast.error>[2]);
        return;
      }
      const { message, details } = extractErrorDetails(err);
      toast.error(fallback, message, details);
    };

    // Failed ACTIONS (mutations) surface as a blocking modal popup so the user
    // clearly sees the action didn't go through (they just clicked something).
    const showActionError = (err: unknown) => {
      if (isAbort(err)) return;
      const { title, description } = friendlyActionError(err);
      void dialog.alertDialog({ title, description, variant: "error", confirmLabel: "Dismiss" });
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
          showLoadError(err, "Failed to load data");
        },
      }),
      mutationCache: new MutationCache({
        // Action failures show a modal (see showActionError). A mutation can opt
        // out — e.g. when it renders its own inline error — with
        // meta: { suppressGlobalError: true }. 403s stay silent (the UI already
        // gates the action) unless a mutation wants to surface it itself.
        onError: (err, _vars, _ctx, mutation) => {
          if (mutation.meta?.suppressGlobalError) return;
          showActionError(err);
        },
      }),
    });
  });

  // TanStack's QueryClientProvider resolves children prop against the root-hoisted
  // @types/react@18 (still pinned by other workspace apps), while this file resolves
  // ReactNode against the quikhrms-local @types/react@19. `unknown` bridges the gap.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return <QueryClientProvider client={queryClient}>{children as any}</QueryClientProvider>;
}
