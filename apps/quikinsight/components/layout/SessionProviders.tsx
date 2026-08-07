"use client";
import { SessionProvider } from "next-auth/react";
import type { ReactNode } from "react";

// Client wrapper so Topbar (and any client component) can read the session via
// useSession(). Wraps the whole app in app/layout.tsx.
export default function SessionProviders({ children }: { children: ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
