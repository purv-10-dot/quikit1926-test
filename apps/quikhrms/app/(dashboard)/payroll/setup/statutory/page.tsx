"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Shield, Check, ArrowRight, ArrowLeft } from "lucide-react";
import { clsx } from "clsx";
import { EPFTab } from "./_tabs/epf";
import { ESITab } from "./_tabs/esi";
import { ProfessionalTaxTab } from "./_tabs/pt";
import { LWFTab } from "./_tabs/lwf";
import { BonusTab } from "./_tabs/bonus";
import { StateMinimumWageTab } from "./_tabs/state-min-wage";
import { SkeletonLine } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";

type TabKey = "EPF" | "ESI" | "Professional Tax" | "Labour Welfare Fund" | "Statutory Bonus" | "State Min. Wages";
const TABS: TabKey[] = ["EPF", "ESI", "Professional Tax", "Labour Welfare Fund", "Statutory Bonus", "State Min. Wages"];

interface StatutoryStatus {
  epf: boolean;
  esi: boolean;
  pt: boolean;
  lwf: boolean;
  bonus: boolean;
}

export default function StatutoryComponentsPage() {
  return (
    <Suspense fallback={<div className="p-4 space-y-2"><SkeletonLine w="40%" h={16} /><SkeletonLine w="70%" h={12} /><SkeletonLine w="60%" h={12} /></div>}>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <StatutoryComponentsPageInner />
    </Suspense>
  );
}

function StatutoryComponentsPageInner() {
  const api = useApiClient();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo") ?? "/payroll/setup";

  const [tab, setTab] = useState<TabKey>("EPF");

  const { data } = useQuery({
    queryKey: ["payroll", "statutory", "status"],
    queryFn: () => api.get<StatutoryStatus>("/api/v1/hrms/payroll/statutory/status"),
    staleTime: 5 * 60_000,
  });
  const status = data?.data;

  const statusMap: Record<TabKey, boolean> = {
    "EPF": !!status?.epf,
    "ESI": !!status?.esi,
    "Professional Tax": !!status?.pt,
    "Labour Welfare Fund": !!status?.lwf,
    "Statutory Bonus": !!status?.bonus,
    "State Min. Wages": false,
  };

  const currentIdx = TABS.indexOf(tab);
  const hasAny = Object.values(statusMap).some(Boolean);

  const completedCount = Object.values(statusMap).filter(Boolean).length;
  const progressPct = (completedCount / TABS.length) * 100;

  return (
    <div className="max-w-5xl mx-auto pb-24">
      {/* Hero */}
      <div className="rounded-2xl bg-gradient-to-r from-[#166534] to-[#16a34a] text-white px-5 py-4 shadow-sm flex items-start gap-4 mb-5">
        <div className="w-11 h-11 rounded-xl bg-white/15 flex items-center justify-center shrink-0">
          <Shield size={22} />
        </div>
        <div className="flex-1">
          <h1 className="font-serif-display text-base font-semibold leading-tight">Statutory Components</h1>
          <p className="text-xs text-white/75 mt-1">
            EPF, ESI, PT, LWF and Bonus — configure once, applies to all payroll runs.
          </p>
          <div className="mt-3 flex items-center gap-3">
            <div className="flex-1 max-w-xs h-1.5 bg-white/20 rounded-full overflow-hidden">
              <div className="h-full bg-emerald-400 transition-all" style={{ width: `${progressPct}%` }} />
            </div>
            <span className="text-xs font-semibold">{completedCount} / {TABS.length} configured</span>
          </div>
        </div>
      </div>

      {/* Stepper rail + content */}
      <div className="flex gap-4">
        {/* Left rail */}
        <aside className="w-60 shrink-0">
          <nav className="space-y-1.5 sticky top-4">
            {TABS.map((t, idx) => {
              const done = statusMap[t];
              const active = tab === t;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => setTab(t)}
                  className={clsx(
                    "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-left transition",
                    active ? "bg-white border border-[#22c55e] shadow-sm" : "border border-transparent hover:bg-white/60",
                  )}
                >
                  <div
                    className={clsx(
                      "w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0 transition",
                      done ? "bg-emerald-500 text-white" : active ? "bg-green-600 text-white" : "border-2 border-gray-300 text-gray-500 bg-white",
                    )}
                  >
                    {done ? <Check size={14} strokeWidth={3} /> : idx + 1}
                  </div>
                  <span className={clsx("text-[13px] font-semibold", active ? "text-[#166534]" : done ? "text-gray-700" : "text-gray-600")}>
                    {t}
                  </span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
            <div className="p-4">
              {tab === "EPF" && <EPFTab />}
              {tab === "ESI" && <ESITab />}
              {tab === "Professional Tax" && <ProfessionalTaxTab />}
              {tab === "Labour Welfare Fund" && <LWFTab />}
              {tab === "Statutory Bonus" && <BonusTab />}
              {tab === "State Min. Wages" && <StateMinimumWageTab />}
            </div>
          </section>
        </div>
      </div>

      {/* Sticky footer */}
      <div className="sticky bottom-4 z-10 mt-5 flex items-center justify-between gap-3 bg-white border border-gray-200 rounded-xl shadow-md px-4 py-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setTab(TABS[Math.max(0, currentIdx - 1)])}
            disabled={currentIdx === 0}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ArrowLeft size={13} /> Previous
          </button>
          <button
            type="button"
            onClick={() => setTab(TABS[Math.min(TABS.length - 1, currentIdx + 1)])}
            disabled={currentIdx === TABS.length - 1}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Next <ArrowRight size={13} />
          </button>
        </div>
        <button
          type="button"
          onClick={() => router.push(returnTo.startsWith("/") ? returnTo : "/payroll/setup")}
          disabled={!hasAny}
          title={hasAny ? "Return to setup" : "Configure at least one statutory component"}
          className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg text-xs font-medium shadow-sm"
        >
          Done <ArrowRight size={13} />
        </button>
      </div>
    </div>
  );
}
