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
          },
        },
        mutationCache: new MutationCache({
          onSuccess: (_data, _vars, _ctx, mutation) => {
            if (isSilentMutation(mutation.options.meta)) return;
            toast.success(resolveSuccessMessage(mutation.options.meta));
          },
          onError: (error, _vars, _ctx, mutation) => {
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
