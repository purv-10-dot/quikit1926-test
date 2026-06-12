"use client";

import { useEffect, useState } from "react";
import {
  OrderDashboardOverview,
  type OrderOverviewActivity,
} from "@/components/orders/order-dashboard-overview";
import { OrderLinesTab } from "@/components/orders/order-lines-tab";
import { OrderRelatedTab } from "@/components/orders/order-related-tab";
import {
  UnifiedTimeline,
  type UnifiedTimelineSeed,
} from "@/components/leads/dashboard/unified-timeline";
import { LeadDashboardErrorBoundary } from "@/components/leads/dashboard/error-boundary";
import { EntityDocumentsCard } from "@/components/documents/entity-documents-card";
import type { OrderDashboardSnapshot } from "@/lib/services/orders/dashboard-snapshot";
import type { Order360Row } from "@/lib/services/orders/full-record";

export const ORDER_TABS = [
  { key: "overview", label: "Overview" },
  { key: "timeline", label: "Timeline" },
  { key: "lines", label: "Lines" },
  { key: "documents", label: "Documents" },
  { key: "related", label: "Related" },
] as const;

export type TabKey = (typeof ORDER_TABS)[number]["key"];

interface Props {
  order: Order360Row;
  account: { id: string; name: string } | null;
  contact: { id: string; firstName: string; lastName: string | null; email: string | null } | null;
  opportunity: { id: string; name: string; stage: string } | null;
  snapshot: OrderDashboardSnapshot;
  timelineSeed: UnifiedTimelineSeed;
  overviewActivities: OrderOverviewActivity[];
  activeTab?: TabKey;
  onTabChange?: (tab: TabKey) => void;
}

export function OrderDetailTabs({
  order,
  account,
  contact,
  opportunity,
  snapshot,
  timelineSeed,
  overviewActivities,
  activeTab: controlledTab,
  onTabChange,
}: Props) {
  const [internalTab, setInternalTab] = useState<TabKey>("overview");
  const [mountedTabs, setMountedTabs] = useState<Set<TabKey>>(() => new Set(["overview"]));
  const active = controlledTab ?? internalTab;
  const setActive = onTabChange ?? setInternalTab;

  useEffect(() => {
    setMountedTabs((prev) => {
      if (prev.has(active)) return prev;
      const next = new Set(prev);
      next.add(active);
      return next;
    });
  }, [active]);

  return (
    <section className="crm-card overflow-hidden shadow-sm">
      <div className="crm-hscroll sticky top-0 z-10 overflow-x-auto border-b border-crm-border bg-white/95 backdrop-blur dark:bg-slate-900/95">
        <div className="flex min-w-max gap-0.5 px-2" role="tablist">
          {ORDER_TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={active === t.key}
              onClick={() => setActive(t.key)}
              className={
                "shrink-0 border-b-2 px-4 py-3 text-sm font-medium transition " +
                (active === t.key
                  ? "border-accent-600 text-accent-700"
                  : "border-transparent text-crm-muted hover:text-crm-text")
              }
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="p-4 sm:p-5">
        {mountedTabs.has("overview") && (
          <div className={active === "overview" ? "" : "hidden"}>
            <OrderDashboardOverview
              order={order}
              snapshot={snapshot}
              activities={overviewActivities}
              onNavigateTab={setActive}
            />
          </div>
        )}

        {mountedTabs.has("timeline") && (
          <div className={active === "timeline" ? "" : "hidden"}>
            <LeadDashboardErrorBoundary>
              <UnifiedTimeline
                leadId={order.id}
                seed={timelineSeed}
                emptyTitle="No order activity yet"
                emptyDescription="Status changes and quote conversion events appear here."
              />
            </LeadDashboardErrorBoundary>
          </div>
        )}

        {mountedTabs.has("lines") && (
          <div className={active === "lines" ? "" : "hidden"}>
            <OrderLinesTab order={order} />
          </div>
        )}

        {mountedTabs.has("documents") && (
          <div className={active === "documents" ? "" : "hidden"}>
            <EntityDocumentsCard refType="order" entityId={order.id} />
          </div>
        )}

        {mountedTabs.has("related") && (
          <div className={active === "related" ? "" : "hidden"}>
            <OrderRelatedTab
              order={order}
              account={account}
              contact={contact}
              opportunity={opportunity}
            />
          </div>
        )}
      </div>
    </section>
  );
}
