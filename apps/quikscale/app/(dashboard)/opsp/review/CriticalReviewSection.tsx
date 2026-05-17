"use client";

/**
 * CriticalReviewSection — body of the new "Critical Review" top-level tab on
 * the OPSP Review screen.
 *
 * Owns:
 *   - Module sub-tabs ([Actions QTR] [Year] [People])
 *   - Data fetch from /api/opsp/review/critical
 *   - Drawer open/close state for editing one card's 4 bullets
 *   - Per-card save via POST /api/opsp/review/critical (one POST per
 *     changed bullet on Save Changes)
 *   - Read-only banner when OPSP is draft / reviewed
 *
 * The year + quarter come from the parent (`<OPSPReviewPage>`); switching them
 * triggers a refetch.
 */

import { useCallback, useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { AlertTriangle, Loader2 } from "lucide-react";
import { CriticalTable, type CriticalTableEntry } from "./CriticalTable";
import { CriticalReviewDrawer } from "./CriticalReviewDrawer";

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
  /** Saved entries keyed by `"<module>:<cardType>:<bulletIndex>"`. */
  entries: Record<string, CriticalTableEntry>;
  year: number;
  quarter: string;
}

const MODULE_TABS: { key: Module; label: string }[] = [
  { key: "actions", label: "Actions QTR" },
  { key: "year",    label: "Year" },
  { key: "people",  label: "People" },
];

export function CriticalReviewSection({
  year,
  quarter,
}: {
  year: number;
  quarter: string;
}) {
  const [activeModule, setActiveModule] = useState<Module>("actions");
  const [data, setData] = useState<CriticalReviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Drawer state — which card is open right now.
  const [drawer, setDrawer] = useState<{
    open: boolean;
    cardType: CardType;
  }>({ open: false, cardType: "critical" });
  const [saving, setSaving] = useState(false);

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

  /* ── Save the changed bullets when the drawer Save Changes fires ── */
  const handleDrawerSave = useCallback(
    async (
      moduleKey: Module,
      cardType: CardType,
      category: string,
      changes: Array<{ bulletIndex: number; patch: CriticalTableEntry }>,
    ) => {
      if (!changes.length) return;
      setSaving(true);
      try {
        // POSTs in parallel (≤4 bullets → bounded fan-out).
        const results = await Promise.all(
          changes.map((c) =>
            fetch("/api/opsp/review/critical", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                year, quarter,
                module: moduleKey,
                cardType,
                bulletIndex: c.bulletIndex,
                category,
                achievedValue: c.patch.achievedValue,
                comment: c.patch.comment,
              }),
            }).then((r) => r.json()),
          ),
        );
        // Optimistic merge into local state — only patch entries we successfully saved.
        setData((prev) => {
          if (!prev) return prev;
          const nextEntries = { ...prev.entries };
          changes.forEach((c, i) => {
            const ok = results[i]?.success;
            if (!ok) return;
            nextEntries[`${moduleKey}:${cardType}:${c.bulletIndex}`] = c.patch;
          });
          return { ...prev, entries: nextEntries };
        });
        // Any failure → resync from server.
        if (results.some((r) => !r?.success)) {
          await loadData();
        }
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

  // Build per-card entry lookups: { 0: { achievedValue, comment }, 1: {...}, ... }
  const buildEntryMap = (cardType: CardType) => {
    const out: Partial<Record<number, CriticalTableEntry>> = {};
    for (let i = 0; i < 4; i++) {
      const key = `${activeModule}:${cardType}:${i}`;
      if (data.entries[key]) out[i] = data.entries[key];
    }
    return out;
  };

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
          entries={buildEntryMap("critical")}
          onOpenEdit={() => setDrawer({ open: true, cardType: "critical" })}
        />
        <CriticalTable
          label="Balancing Critical #"
          index={2}
          card={moduleCards.balancing}
          entries={buildEntryMap("balancing")}
          onOpenEdit={() => setDrawer({ open: true, cardType: "balancing" })}
        />
      </div>

      {/* ── Drawer ── */}
      <CriticalReviewDrawer
        open={drawer.open}
        onClose={() => setDrawer((d) => ({ ...d, open: false }))}
        heading={drawerHeading}
        card={activeCard}
        entries={buildEntryMap(drawer.cardType)}
        readOnly={readOnly}
        saving={saving}
        onSave={(changes) =>
          handleDrawerSave(activeModule, drawer.cardType, activeCard.title, changes)
        }
      />
    </div>
  );
}
