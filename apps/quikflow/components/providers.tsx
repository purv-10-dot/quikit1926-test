"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { ConfirmProvider } from "@quikit/ui";
import { useState } from "react";

/**
 * Provider order is fixed across all QuikIT apps:
 *   SessionProvider → QueryClientProvider → ThemeProvider
 *
 * Do NOT reorder, add new providers without architect approval, or remove
 * any of the three. See CLAUDE.md "Provider Order" rule.
 *
 * ConfirmProvider (nested innermost, same as apps/quikscale) is the one
 * addition to that chain — it backs `useConfirm()` for destructive-action
 * confirmations (e.g. deleting a workflow) instead of `window.confirm`.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 60 * 1000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider attribute="class" defaultTheme="light">
          <ConfirmProvider>{children}</ConfirmProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
