"use client";

import { usePathname } from "next/navigation";

/**
 * Extra bottom clearance so the SetupGate floating "Setup x/10" reminder
 * (fixed bottom-right — see setup-gate.tsx) never sits on top of a page's
 * own bottom-right action button. Only /settings and /payroll pages have
 * that kind of button, so only they get the clearance — every other page
 * (e.g. plain data-table pages like Assigned Positions) would otherwise
 * carry ~96px of unused blank space at the bottom, which can force a
 * scrollbar to appear even when the actual content fits the viewport.
 */
const CLEARANCE_PREFIXES = ["/settings", "/payroll"];

function needsClearance(pathname: string): boolean {
  return CLEARANCE_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

export function PageContentShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const clearance = needsClearance(pathname ?? "");

  return (
    <div className={clearance ? "px-4 py-4 pb-24 lg:px-6 lg:py-5 lg:pb-24" : "px-4 py-4 lg:px-6 lg:py-5"}>
      {children}
    </div>
  );
}
