"use client";

import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { useFiscalYears } from "@/lib/hooks/useFiscalYears";

// Pages that work without quarters — org setup is where you configure them
const EXCLUDED_PREFIXES = ["/org-setup", "/settings"];

export function QuarterRequiredGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { years, isLoading } = useFiscalYears();
  const [navigating, setNavigating] = useState(false);

  const isExcluded = EXCLUDED_PREFIXES.some((p) => pathname?.startsWith(p));
  if (isExcluded || isLoading || years.length > 0) return <>{children}</>;

  function handleClick() {
    if (navigating) return;
    setNavigating(true);
    router.push("/org-setup/quarters");
  }

  return (
    <div className="flex-1 flex items-center justify-center h-full min-h-[60vh] px-4">
      <div className="flex flex-col items-center gap-4 text-center max-w-sm">
        <div className="flex items-center justify-center h-16 w-16 rounded-2xl bg-[var(--color-bg-card)] border border-[var(--color-border)] shadow-sm">
          <CalendarDays className="h-8 w-8 text-[var(--accent-600)]" />
        </div>

        <div className="space-y-1.5">
          <h2 className="text-base font-semibold text-[var(--color-text-primary)]">
            Quarters not set up yet
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
            This module needs fiscal quarter configuration to display data.
            Set up your quarters to get started.
          </p>
        </div>

        <button
          onClick={handleClick}
          disabled={navigating}
          className={[
            "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors",
            "bg-[var(--accent-600)]",
            navigating
              ? "opacity-60 cursor-not-allowed"
              : "hover:bg-[var(--accent-700)] cursor-pointer",
          ].join(" ")}
        >
          <CalendarDays className="h-4 w-4" />
          {navigating ? "Redirecting…" : "Go to Quarter Settings"}
        </button>
      </div>
    </div>
  );
}
