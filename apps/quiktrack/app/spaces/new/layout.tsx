"use client";

import { SessionGuard } from "@/components/session-guard";

export default function CreateSpaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGuard>
      {children}
    </SessionGuard>
  );
}
