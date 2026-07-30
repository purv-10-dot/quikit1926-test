"use client";

import { Suspense, useState } from "react";
import { FileText, Receipt } from "lucide-react";
import Form16Page from "../form16/page";
import Form12BBPage from "../form12bb/page";
import { PageBackground } from "@/components/hrms/page-background";
import { TabSwitcher } from "@/components/hrms/tab-switcher";

type Tab = "form16" | "form12bb";

const TABS: { id: Tab; label: string; icon: React.ReactNode }[] = [
  { id: "form16",   label: "Tax computation", icon: <FileText size={13} /> },
  { id: "form12bb", label: "Form 12BB",    icon: <Receipt size={13} /> },
];

export default function TaxFilingsHub() {
  const [tab, setTab] = useState<Tab>("form16");

  return (
    <div className="w-full px-5 py-4">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <h1 className="text-page-title text-gray-900 mb-1">Tax Filings</h1>
      <p className="text-xs text-gray-500 mb-5">Statutory tax documents and challans in one place.</p>

      <TabSwitcher
        className="mb-5"
        value={tab}
        onChange={(v) => setTab(v as Tab)}
        tabs={TABS.map((t) => ({ value: t.id, label: t.label, icon: t.icon }))}
      />

      <Suspense fallback={<div className="text-xs text-gray-400">Loading…</div>}>
        {tab === "form16"   && <Form16Page />}
        {tab === "form12bb" && <Form12BBPage />}
      </Suspense>
    </div>
  );
}
