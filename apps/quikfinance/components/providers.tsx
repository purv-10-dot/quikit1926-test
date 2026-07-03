"use client";

import { SessionProvider } from "next-auth/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { I18nProvider } from "@/lib/i18n";
import { CurrencyProvider } from "@/lib/currency";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            staleTime: 30_000,
            retry: 1
          }
        }
      })
  );

  // SessionProvider added for platform SSO — the /login stub + any useSession()
  // callers need it. Wraps the finance providers (react-query / i18n / currency).
  return (
    <SessionProvider>
      <QueryClientProvider client={queryClient}>
        <I18nProvider>
          <CurrencyProvider>{children}</CurrencyProvider>
        </I18nProvider>
      </QueryClientProvider>
    </SessionProvider>
  );
}
