"use client";

/**
 * CriticalReviewSection — body of the "Critical Hash Review" top-level tab on
 * the OPSP Review screen.
 *
 * Owns:
 *   - Module sub-tabs ([Year] [Quarter] [Individual])
 *   - Data fetch from /api/opsp/review/critical
 *   - Drawer open/close state for editing one card's Achieved + Comment
 *   - Per-card save via POST /api/opsp/review/critical (one POST per card)
 *   - Read-only banner when OPSP is draft / reviewed
 *
 * Tab keys stay `actions / year / people` for API stability; only labels and
 * tab order change here. Internal key → label mapping:
 *   year    → "Year"        (OPSPData.criticalNumGoals)
 *   actions → "Quarter"     (OPSPData.criticalNumProcess)   — was "Actions QTR"
 *   people  → "Individual"  (OPSPData.criticalNumAcct)      — was "People"
 *
 * Entries are now keyed by `"<module>:<cardType>"` (one entry per card, no
 * bullet index). Tier is derived live by `resolveCritTier()` in the
 * drawer/table from the 4 projected values on the CritCard.
 */

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2 } from "lucide-react";
import { CriticalTable, type CriticalTableEntry } from "./CriticalTable";
import { CriticalReviewDrawer } from "./CriticalReviewDrawer";
import { AuditLogDrawer } from "@/components/logs/audit-log-drawer";
import { OPSP_FIELD_LABELS } from "@/lib/utils/auditLog";

type Module = "actions" | "year" | "people";
type CardType = "critical" | "balancing";

interface CritCardShape {
  title: string;
  bullets: string[];
}

interface ModuleCards {
  critical: CritCardShape;
  balancing: CritCardShape;
}

interface CriticalReviewData {
  opspId: string | null;
  opspStatus: string | null;
  modules: Record<Module, ModuleCards>;
  /** Saved entries keyed by `"<module>:<cardType>"`. */
  entries: Record<string, CriticalTableEntry>;
  year: number;
  quarter: string;
}

const MODULE_TABS: { key: Module; label: string }[] = [
  { key: "year",    label: "Year" },
  { key: "actions", label: "Quarter" },
  { key: "people",  label: "Individual" },
];

export function CriticalReviewSection({
  year,
  quarter,
}: {
  year: number;
  quarter: string;
}) {
  const [activeModule, setActiveModule] = useState<Module>("year");
  const [data, setData] = useState<CriticalReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer state — which card is open right now.
  const [drawer, setDrawer] = useState<{
    open: boolean;
    cardType: CardType;
  }>({ open: false, cardType: "critical" });
  const [saving, setSaving] = useState(false);

  // Audit-log drawer state — which critical card's history is open.
  const [logsCard, setLogsCard] = useState<{
    cardType: CardType;
    title: string;
  } | null>(null);

  /* ── Load ── */
  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/opsp/review/critical?year=${year}&quarter=${quarter}`);
      const json = await res.json();
      if (!json.success) {
        setError(json.error ?? "Failed to load critical review");
        return;
      }
      setData(json.data);
    } catch {
      setError("Network error");
    } finally {
      setLoading(false);
    }
  }, [year, quarter]);

  useEffect(() => { loadData(); }, [loadData]);

  /* ── Save the card's Achieved + Comment when the drawer Save Changes fires ── */
  const handleDrawerSave = useCallback(
    async (
      moduleKey: Module,
      cardType: CardType,
      category: string,
      patch: CriticalTableEntry,
    ) => {
      setSaving(true);
      try {
        const res = await fetch("/api/opsp/review/critical", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            year, quarter,
            module: moduleKey,
            cardType,
            category,
            achievedValue: patch.achievedValue,
            comment: patch.comment,
          }),
        });
        const json = await res.json();
        if (!json.success) {
          await loadData();
          return;
        }
        // Optimistic merge into local state.
        setData((prev) => {
          if (!prev) return prev;
          return {
            ...prev,
            entries: {
              ...prev.entries,
              [`${moduleKey}:${cardType}`]: patch,
            },
          };
        });
        setDrawer((d) => ({ ...d, open: false }));
      } catch {
        await loadData();
      } finally {
        setSaving(false);
      }
    },
    [year, quarter, loadData],
  );

  /* ── Render ── */

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading critical review…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64 text-red-500 text-sm">
        {error}
      </div>
    );
  }

  if (!data || !data.opspId) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3 text-gray-500 text-sm">
        <AlertTriangle className="h-7 w-7 text-amber-500" />
        <p>No OPSP found for this period.</p>
      </div>
    );
  }

  const isCommitted =
    data.opspStatus === "finalized" || data.opspStatus === "reviewed";
  const readOnly = !isCommitted || data.opspStatus === "reviewed";

  const moduleCards = data.modules[activeModule];

  const entryFor = (cardType: CardType): CriticalTableEntry | null =>
    data.entries[`${activeModule}:${cardType}`] ?? null;

  const activeCard =
    drawer.cardType === "critical" ? moduleCards.critical : moduleCards.balancing;
  const drawerLabel = drawer.cardType === "critical" ? "Critical #" : "Balancing Critical #";
  const drawerHeading =
    `${drawerLabel}${activeCard.title.trim() ? ` — ${activeCard.title}` : ""}`;

  return (
    <div className="flex flex-col h-full">
      {/* ── Module sub-tabs ── */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0">
        {MODULE_TABS.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveModule(tab.key)}
            className={cn(
              "px-4 py-1.5 text-xs font-semibold rounded-full border transition-colors",
              activeModule === tab.key
                ? "bg-accent-600 text-white border-accent-600"
                : "border-gray-200 text-gray-600 hover:bg-gray-50",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* ── Read-only banner (draft / reviewed) ── */}
      {!isCommitted ? (
        <div className="mx-6 mt-4 flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-md text-xs text-amber-800">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          OPSP is in <span className="font-semibold">draft</span> status —
          Critical Review inputs become editable after Finalize.
        </div>
      ) : data.opspStatus === "reviewed" ? (
        <div className="mx-6 mt-4 flex items-center gap-2 px-3 py-2 bg-gray-50 border border-gray-200 rounded-md text-xs text-gray-600">
          <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
          Review has been <span className="font-semibold">submitted</span> —
          read-only.
        </div>
      ) : null}

      {/* ── Tables ── */}
      <div className="flex-1 overflow-y-auto min-h-0 px-6 py-4">
        <CriticalTable
          label="Critical #"
          index={1}
          card={moduleCards.critical}
          entry={entryFor("critical")}
          onOpenEdit={() => setDrawer({ open: true, cardType: "critical" })}
          onOpenLogs={
            data?.opspId
              ? () =>
                  setLogsCard({
                    cardType: "critical",
                    title: moduleCards.critical.title,
                  })
              : undefined
          }
        />
        <CriticalTable
          label="Balancing Critical #"
          index={2}
          card={moduleCards.balancing}
          entry={entryFor("balancing")}
          onOpenEdit={() => setDrawer({ open: true, cardType: "balancing" })}
          onOpenLogs={
            data?.opspId
              ? () =>
                  setLogsCard({
                    cardType: "balancing",
                    title: moduleCards.balancing.title,
                  })
              : undefined
          }
        />
      </div>

      {/* ── Drawer ── */}
      <CriticalReviewDrawer
        open={drawer.open}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
        heading={drawerHeading}
        card={activeCard}
        entry={entryFor(drawer.cardType)}
        readOnly={readOnly}
        saving={saving}
        onSave={(patch) =>
          handleDrawerSave(activeModule, drawer.cardType, activeCard.title, patch)
        }
      />

      {/* ── Audit-log drawer for Critical # Review cards ── */}
      {data?.opspId && logsCard && (
        <AuditLogDrawer
          open
          onClose={() => setLogsCard(null)}
          title={`Audit History — ${logsCard.cardType === "critical" ? "Critical #" : "Balancing Critical #"}`}
          subtitle={`${logsCard.title || "—"} · ${MODULE_TABS.find((t) => t.key === activeModule)?.label}`}
          entityType="Review"
          entityId={data.opspId}
          extraQuery={`OPSP Critical (${activeModule}:${logsCard.cardType})`}
          fieldLabels={OPSP_FIELD_LABELS}
        />
      )}
    </div>
  );
}
