"use client";

import { Suspense, useState } from "react";
import { Banknote, HandCoins } from "lucide-react";
import LoansPage from "../loans/page";
import GivingPage from "../giving/page";
import { PageBackground } from "@/components/hrms/page-background";
import { TabSwitcher } from "@/components/hrms/tab-switcher";

type Tab = "loans" | "giving";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "loans",  label: "Loans",  icon: <Banknote size={14} /> },
  { id: "giving", label: "Giving", icon: <HandCoins size={14} /> },
];

export default function LoansGivingHub() {
  const [tab, setTab] = useState<Tab>("loans");

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <h1 className="text-page-title text-gray-900 mb-1">Advances</h1>
      <p className="text-xs text-gray-500 mb-4">Employee loans and giving — both auto-deduct in pay runs.</p>

      <TabSwitcher
        className="mb-4"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        tabs={TABS.map((t) => ({ value: t.id, label: t.label, icon: t.icon }))}
      />

      <Suspense fallback={<div className="text-sm text-gray-400">Loading…</div>}>
        {tab === "loans"  && <LoansPage />}
        {tab === "giving" && <GivingPage />}
      </Suspense>
    </div>
  );
}
