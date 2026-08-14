"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { CalendarDays, Settings2 } from "lucide-react";
import { useFiscalYears } from "@/lib/hooks/useFiscalYears";

// Pages that work without quarters — org setup is where you configure them.
// Critical Numbers is quarter-independent: a metric carries its own date
// window (time-based mode) or none at all (custom targets), so gating it on
// fiscal-quarter config would block a module that never reads one.
const EXCLUDED_PREFIXES = ["/org-setup", "/settings", "/critical-numbers"];

export function QuarterRequiredGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { years, isLoading } = useFiscalYears();
  const [navigating, setNavigating] = useState(false);

  // The guard stays mounted across client-side navigation, so `navigating`
  // would otherwise stick on "Redirecting…" after the user returns to a
  // quarter-less page. Reset it once the route actually changes (navigation
  // finished) so the buttons return to their normal label.
  useEffect(() => {
    setNavigating(false);
  }, [pathname]);

  const isExcluded = EXCLUDED_PREFIXES.some((p) => pathname?.startsWith(p));
  if (isExcluded || isLoading || years.length > 0) return <>{children}</>;

  function handleClick() {
    if (navigating) return;
    setNavigating(true);
    router.push("/org-setup/quarters");
  }

  function handleOpenConfigurations() {
    if (navigating) return;
    setNavigating(true);
    router.push("/settings?tab=configurations");
  }

  return (
    <div className="flex-1 flex items-center justify-center h-full min-h-[60vh] px-4">
      <div className="flex flex-col items-center gap-4 text-center max-w-md">
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

        {/* Informational tip — how to switch on custom quarter lengths. */}
        <div className="mt-2 w-full rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-card)] p-4">
          <div className="flex items-start gap-2.5 text-left">
            <Settings2 className="h-4 w-4 mt-0.5 flex-shrink-0 text-[var(--accent-600)]" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                Prefer meeting-day aligned quarters?
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                By default, every quarter is a fixed <span className="font-medium">13 weeks</span>. To
                align weeks to your rhythm, open <span className="font-medium">Settings → Configurations</span> and
                enable <span className="font-medium">Custom Quarter Settings</span>. Weeks then start on
                your chosen <span className="font-medium">Weekly Meeting Day</span>, quarters use
                calendar-month boundaries, and each runs 13–14 weeks (with partial weeks at the edges).
                Leave it off to keep the standard 13-week quarters.
              </p>
            </div>
          </div>

          {/* Primary action — centered filled button. */}
          <div className="mt-4 flex justify-center">
            <button
              onClick={handleOpenConfigurations}
              disabled={navigating}
              className={[
                "inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium transition-colors",
                "bg-[var(--accent-600)]",
                navigating
                  ? "opacity-60 cursor-not-allowed"
                  : "hover:bg-[var(--accent-700)] cursor-pointer",
              ].join(" ")}
            >
              <Settings2 className="h-4 w-4" />
              {navigating ? "Redirecting…" : "Open Configurations"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
