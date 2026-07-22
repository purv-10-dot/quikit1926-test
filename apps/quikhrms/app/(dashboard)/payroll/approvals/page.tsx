"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { CheckSquare, Receipt, ShieldCheck, TrendingUp } from "lucide-react";
import { clsx } from "clsx";
import { ReimbursementsTab } from "./_tabs/reimbursements";
import { POITab } from "./_tabs/poi";
import { SalaryRevisionTab } from "./_tabs/salary-revisions";

type TabKey = "Reimbursements" | "ProofOfInvestments" | "SalaryRevision";
const TABS: { key: TabKey; label: string; icon: React.ReactNode; slug: string }[] = [
  { key: "Reimbursements", label: "Reimbursements", icon: <Receipt size={14} />, slug: "reimbursements" },
  { key: "ProofOfInvestments", label: "Proof Of Investments", icon: <ShieldCheck size={14} />, slug: "poi" },
  { key: "SalaryRevision", label: "Salary Revision", icon: <TrendingUp size={14} />, slug: "revision" },
];

function slugToKey(slug: string | null): TabKey {
  const match = TABS.find((t) => t.slug === slug);
  return match?.key ?? "Reimbursements";
}

export default function PayrollApprovalsPage() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const [tab, setTab] = useState<TabKey>(() => slugToKey(searchParams.get("tab")));

  // Keep state in sync if the user hits Back/Forward.
  useEffect(() => {
    const next = slugToKey(searchParams.get("tab"));
    if (next !== tab) setTab(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const switchTab = (key: TabKey) => {
    setTab(key);
    const slug = TABS.find((t) => t.key === key)?.slug ?? "reimbursements";
    router.replace(`${pathname}?tab=${slug}`, { scroll: false });
  };

  return (
    <div className="w-full px-5 py-4 space-y-4">
      <div className="flex items-start gap-3">
        <CheckSquare size={28} className="text-[#22c55e] mt-1.5" />
        <div>
          <h1 className="text-page-title text-gray-900 leading-tight">Approvals</h1>
          <p className="text-xs text-gray-500 mt-1">Review and action employee submissions.</p>
        </div>
      </div>

      <div className="rounded-lg border border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-200 px-5">
          <div className="flex gap-4 overflow-x-auto">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => switchTab(t.key)}
                data-active={tab === t.key}
                className={clsx(
                  "tab-underline whitespace-nowrap py-3 px-1 text-[13px] font-semibold -mb-px inline-flex items-center gap-1.5",
                  tab === t.key ? "text-[#22c55e] font-semibold" : "text-gray-500 hover:text-gray-700",
                )}
              >
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-4">
          {tab === "Reimbursements" && <ReimbursementsTab />}
          {tab === "ProofOfInvestments" && <POITab />}
          {tab === "SalaryRevision" && <SalaryRevisionTab />}
        </div>
      </div>
    </div>
  );
}
