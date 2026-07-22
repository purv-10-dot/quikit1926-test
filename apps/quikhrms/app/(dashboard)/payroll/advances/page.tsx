"use client";

import { Suspense, useState } from "react";
import { clsx } from "clsx";
import { Banknote, HandCoins } from "lucide-react";
import LoansPage from "../loans/page";
import GivingPage from "../giving/page";

type Tab = "loans" | "giving";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "loans",  label: "Loans",  icon: <Banknote size={14} /> },
  { id: "giving", label: "Giving", icon: <HandCoins size={14} /> },
];

export default function LoansGivingHub() {
  const [tab, setTab] = useState<Tab>("loans");

  return (
    <div className="w-full px-5 py-4">
      <h1 className="text-page-title text-gray-900 mb-1">Advances</h1>
      <p className="text-xs text-gray-500 mb-4">Employee loans and giving — both auto-deduct in pay runs.</p>

      <div className="flex gap-1 rounded-lg border border-gray-200 bg-gray-50 p-1 w-fit mb-4">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={clsx(
              "inline-flex items-center gap-1.5 px-4 py-1.5 text-[13px] font-semibold rounded-md transition",
              tab === t.id ? "bg-white text-[#166534] shadow-sm" : "text-gray-600 hover:text-gray-900",
            )}
          >
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      <Suspense fallback={<div className="text-sm text-gray-400">Loading…</div>}>
        {tab === "loans"  && <LoansPage />}
        {tab === "giving" && <GivingPage />}
      </Suspense>
    </div>
  );
}
