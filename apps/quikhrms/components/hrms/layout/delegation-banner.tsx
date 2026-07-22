"use client";

import { UserCheck } from "lucide-react";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";

/**
 * Thin banner shown only while the signed-in user is acting under one or more
 * active delegations. Makes borrowed authority visible so a delegatee always
 * knows when an action they take runs on someone else's behalf.
 */
export function DelegationBanner() {
  const { actingFor } = useDashboardConfig();
  if (!actingFor || actingFor.length === 0) return null;

  const names = actingFor.map((d) => d.name);
  const who =
    names.length === 1
      ? names[0]
      : names.length === 2
        ? `${names[0]} and ${names[1]}`
        : `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;

  return (
    <div className="mb-4 flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:border-amber-500/40 dark:bg-amber-500/10 dark:text-amber-200">
      <UserCheck className="h-4 w-4 shrink-0" />
      <span>
        You&apos;re acting on behalf of <span className="font-semibold">{who}</span> via delegation — actions you take
        here use their approval authority.
      </span>
    </div>
  );
}
