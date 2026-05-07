"use client";

import { SessionGuard } from "@/components/session-guard";
import { ThemeApplier } from "@quikit/ui/theme-applier";

export default function CreateSpaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <SessionGuard>
      <ThemeApplier />
      {children}
    </SessionGuard>
  );
}
