"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ConfirmProvider } from "@quikit/ui";
import { useState, type ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 60 * 1000,
            refetchOnWindowFocus: false,
          },
        },
      })
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        {/* ConfirmProvider — required by `useConfirm` from `@quikit/ui`.
            Pages in approvals/, finance/, and store/ use it for delete/post
            confirmations; without this wrapper the hook throws on first call. */}
        <ConfirmProvider>
          {children}
        </ConfirmProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
