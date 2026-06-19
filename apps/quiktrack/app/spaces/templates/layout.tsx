"use client";

import { SessionGuard } from "@/components/session-guard";

export default function TemplatesLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGuard>
      {children}
    </SessionGuard>
  );
}
