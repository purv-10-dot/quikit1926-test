"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { ConfirmProvider } from "@quikit/ui";
import { Provider as ReduxProvider } from "react-redux";
import { useEffect, useState } from "react";
import { store, initTablesPersistence } from "@/lib/store";

export function Providers({ children }: { children: React.ReactNode }) {
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

  // Rehydrate Redux slices from localStorage AFTER mount so the first client
  // render matches the SSR shell (no hydration mismatch). The init function
  // itself is idempotent.
  useEffect(() => {
    initTablesPersistence();
  }, []);

  return (
    <ReduxProvider store={store}>
      <SessionProvider>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider attribute="class" defaultTheme="light" enableSystem>
            <ConfirmProvider>{children}</ConfirmProvider>
          </ThemeProvider>
        </QueryClientProvider>
      </SessionProvider>
    </ReduxProvider>
  );
}
