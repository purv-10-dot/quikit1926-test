"use client";

/**
 * Approvals Inbox — single page that lists every entity currently waiting
 * on the calling user's approval, across all modules. The /api/approvals/inbox
 * route filters by the caller's permission set so a Store Head only sees
 * GRN / Issue / Transfer / Recon items, an Accounts user only sees RAB,
 * a PM sees DPR / MR / PO L1 / Indent L2, etc.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, ArrowRight, Inbox, Loader2 } from "lucide-react";
import { PageHeader, PageContainer, StatusChip, TabBar } from "@/components/PageShell";
import { usePermissions } from "@/hooks/use-permissions";

interface InboxItem {
  id: string;
  entityType: string;
  title: string;
  subtitle?: string;
  status: string;
  submittedBy?: string;
  submittedAt?: string;
  href: string;
  amount?: number;
}

const ENTITY_LABEL: Record<string, string> = {
  mr: "Material Requisition",
  indent: "Indent",
  po: "Purchase Order",
  grn: "Goods Receipt Note",
  issue: "Material Issue",
  transfer: "Stock Transfer",
  recon: "Stock Reconciliation",
  dpr: "Daily Progress Report",
  rab: "Running A/c Bill",
};

// Three-tone unified entity palette grouped by ERP function:
//   • brand orange — procurement / financial commitment (MR, Indent, PO, RAB)
//   • info blue    — execution / movement (GRN, Issue, Transfer, DPR)
//   • success green— reconciliation / verification (Recon)
const ENTITY_COLOR: Record<string, string> = {
  mr:       "bg-orange-50 text-orange-700 border border-orange-200",
  indent:   "bg-orange-50 text-orange-700 border border-orange-200",
  po:       "bg-orange-50 text-orange-700 border border-orange-200",
  rab:      "bg-orange-50 text-orange-700 border border-orange-200",
  grn:      "bg-sky-50 text-sky-700 border border-sky-200",
  issue:    "bg-sky-50 text-sky-700 border border-sky-200",
  transfer: "bg-sky-50 text-sky-700 border border-sky-200",
  dpr:      "bg-sky-50 text-sky-700 border border-sky-200",
  recon:    "bg-emerald-50 text-emerald-700 border border-emerald-200",
};

type InboxTab = "pending" | "approved";

const TABS: Array<{ key: InboxTab; label: string }> = [
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
];

export default function ApprovalsInboxPage() {
  const router = useRouter();
  const { roleKey, isLoading: permsLoading } = usePermissions();
  const [activeTab, setActiveTab] = useState<InboxTab>("pending");

  const { data, isLoading, isError } = useQuery({
    queryKey: ["approvals-inbox", activeTab],
    queryFn: async () => {
      const res = await fetch(`/api/approvals/inbox?status=${activeTab}`);
      if (!res.ok) throw new Error("Failed to load inbox");
      const json = await res.json();
      return (json.data ?? json) as { items: InboxItem[]; total: number };
    },
    refetchInterval: 30_000,
  });

  const items = data?.items ?? [];
  const grouped = items.reduce<Record<string, InboxItem[]>>((acc, it) => {
    (acc[it.entityType] = acc[it.entityType] ?? []).push(it);
    return acc;
  }, {});
  const groups = Object.keys(grouped).sort();
  const isPendingTab = activeTab === "pending";

  return (
    <>
      <PageHeader
        title="Approvals Inbox"
        subtitle={
          isPendingTab
            ? "Pending requests waiting on your action"
            : "Already-approved requests across modules you can act on"
        }
        actions={
          <div className="text-xs text-gray-500">
            {permsLoading ? "Loading…" : (
              <>Logged in as <span className="font-semibold text-gray-700">{roleKey?.replace(/_/g, " ")}</span></>
            )}
          </div>
        }
      />
      <TabBar
        tabs={TABS}
        activeTab={activeTab}
        onTabChange={(k) => setActiveTab(k as InboxTab)}
      />
      <PageContainer>
        {isLoading && (
          <div className="flex items-center justify-center py-20 text-gray-400">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Loading inbox…
          </div>
        )}

        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-6 text-sm text-red-700">
            Failed to load approval inbox. You may not have any approver
            permissions assigned to your role.
          </div>
        )}

        {!isLoading && !isError && items.length === 0 && (
          <div className="bg-white border border-slate-200 rounded-xl p-12 text-center shadow-soft">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-gradient-to-br from-emerald-50 to-emerald-100 text-emerald-600 mb-3 ring-4 ring-emerald-50">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              {isPendingTab ? "All caught up" : "Nothing approved yet"}
            </h3>
            <p className="text-sm text-slate-500 mt-1">
              {isPendingTab
                ? "No pending approvals for your role right now."
                : "Once requests are approved, they'll appear here."}
            </p>
          </div>
        )}

        {!isLoading && items.length > 0 && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-sm text-gray-600">
              <Inbox className="w-4 h-4" />
              <span>
                <span className="font-semibold text-gray-900">{items.length}</span>{" "}
                {isPendingTab
                  ? `pending action${items.length !== 1 ? "s" : ""}`
                  : `approved request${items.length !== 1 ? "s" : ""}`}
              </span>
            </div>

            {groups.map((entityType) => {
              const list = grouped[entityType]!;
              return (
                <div key={entityType} className="bg-white rounded-xl border border-slate-200 shadow-soft overflow-hidden">
                  <div className="px-5 py-3 border-b border-slate-100 bg-gradient-to-r from-slate-50 to-white flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${ENTITY_COLOR[entityType] ?? "bg-slate-100 text-slate-700 border border-slate-200"}`}>
                        {ENTITY_LABEL[entityType] ?? entityType}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">{list.length}</span>
                    </div>
                  </div>
                  <ul className="divide-y divide-gray-100">
                    {list.map((it) => (
                      <li key={`${entityType}-${it.id}`}>
                        <button
                          type="button"
                          onClick={() => router.push(it.href)}
                          className="w-full px-5 py-3 hover:bg-orange-50/50 transition-colors flex items-center gap-4 text-left"
                        >
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                              <span className="text-sm font-semibold text-gray-900 truncate">{it.title}</span>
                              <StatusChip status={it.status} />
                            </div>
                            {it.subtitle && (
                              <p className="text-xs text-gray-500 truncate">{it.subtitle}</p>
                            )}
                            {it.submittedAt && (
                              <p className="text-[10px] text-gray-400 mt-0.5">
                                Submitted {new Date(it.submittedAt).toLocaleDateString()}
                                {it.submittedBy && ` by ${it.submittedBy}`}
                              </p>
                            )}
                          </div>
                          {it.amount !== undefined && it.amount > 0 && (
                            <div className="text-right">
                              <p className="text-[10px] text-gray-500 uppercase">Amount</p>
                              <p className="text-sm font-bold text-gray-900">
                                ₹ {it.amount.toLocaleString("en-IN")}
                              </p>
                            </div>
                          )}
                          <ArrowRight className="w-4 h-4 text-gray-300 shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        )}
      </PageContainer>
    </>
  );
}
