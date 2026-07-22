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
import { CriticalTable, CRITICAL_HIDEABLE_COLUMNS, type CriticalTableEntry } from "./CriticalTable";
import { CriticalReviewDrawer } from "./CriticalReviewDrawer";
import { MasterDataMoreActions } from "@/components/table/MasterDataMoreActions";
import { useTablePrefs } from "@/lib/hooks/useTablePreferences";
import { EntityChangeHistoryPanel } from "@/components/audit/EntityChangeHistoryPanel";
import { criticalReviewAuditConfig } from "@/components/audit/criticalReviewAuditConfig";
import { criticalEntityId, criticalScopeLabel, CARD_LABELS } from "@/lib/audit/criticalFields";
import { SectionUserPicker } from "../components/SectionUserPicker";

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
  /** Subject whose Individual criticals are shown — scopes the audit timeline. */
  subjectUserId?: string | null;
}

const MODULE_TABS: { key: Module; label: string }[] = [
  { key: "year",    label: "Year" },
  { key: "actions", label: "Quarter" },
  { key: "people",  label: "Individual" },
];

export function CriticalReviewSection({
  year,
  quarter,
  allowedModules = ["year", "actions", "people"],
  canPickUser = false,
  // Fail closed: editing requires OPSP.Review.Critical:update. If a caller
  // forgets to pass `canEdit`, the section stays read-only rather than
  // silently allowing a view-only user to overwrite review numbers.
  canEdit = false,
  selfId = "",
  selfName = "Me",
}: {
  year: number;
  quarter: string;
  /** Sub-tabs the user may see (admins: all; others: ["people"] only). */
  allowedModules?: Module[];
  /** Show the Individual user-picker (admin with OPSP.EditUser). */
  canPickUser?: boolean;
  /** Whether the Achieved/Comment inputs are editable (OPSP.Review.Critical:update). */
  canEdit?: boolean;
  /** Signed-in user's id — excluded from the picker list (shown as "(you)"). */
  selfId?: string;
  /** Display name for the signed-in user (the picker's "self" option). */
  selfName?: string;
}) {
  const visibleTabs = MODULE_TABS.filter((t) => allowedModules.includes(t.key));
  const [activeModule, setActiveModule] = useState<Module>(allowedModules[0] ?? "people");
  // Column show/hide for the Critical cards — shared across both cards + all
  // scopes (it's about which columns to display, consistent everywhere).
  const { hiddenCols, hideCol, setHiddenCols } = useTablePrefs("opspReviewCritical");
  // Individual (people) subject: null = self; an id when an admin picks a user.
  const [targetUserId, setTargetUserId] = useState<string | null>(null);
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
      const qs = `year=${year}&quarter=${quarter}${targetUserId ? `&targetUserId=${encodeURIComponent(targetUserId)}` : ""}`;
      const res = await fetch(`/api/opsp/review/critical?${qs}`);
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
  }, [year, quarter, targetUserId]);

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
            // Per-user Individual review targets the picked subject (admin only).
            ...(moduleKey === "people" && targetUserId ? { targetUserId } : {}),
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
    [year, quarter, loadData, targetUserId],
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
  // Editable only when finalized (not reviewed) AND the user holds update.
  const readOnly = !isCommitted || data.opspStatus === "reviewed" || !canEdit;

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
      {/* ── Module sub-tabs (filtered to the user's allowed scopes) ── */}
      <div className="flex items-center gap-2 px-6 py-3 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap">
        {visibleTabs.map((tab) => (
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

        {/* Right side: optional Individual user-picker + Manage Columns menu. */}
        <div className="ml-auto flex items-center gap-2">
          {canPickUser && activeModule === "people" && (
            <>
              <span className="text-[11px] font-semibold text-gray-500">Reviewing:</span>
              <SectionUserPicker
                value={targetUserId}
                selfId={selfId}
                selfName={selfName}
                onChange={(u) => setTargetUserId(u)}
              />
            </>
          )}
          <MasterDataMoreActions
            columns={CRITICAL_HIDEABLE_COLUMNS}
            hiddenCols={hiddenCols}
            onHiddenColsChange={setHiddenCols}
            isTrashActive={false}
            onToggleTrash={() => {}}
            showTrash={false}
          />
        </div>
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
          hiddenCols={hiddenCols}
          onHideCol={hideCol}
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
          hiddenCols={hiddenCols}
          onHideCol={hideCol}
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

      {/* ── Change History panel for Critical # Review cards — the same rich
          timeline (tabs, operation pills, field-level diffs, export) used by
          KPI / Priority / WWW. ── */}
      {data?.opspId && logsCard && (
        <EntityChangeHistoryPanel
          entity={{
            id: criticalEntityId(data.opspId, activeModule, logsCard.cardType, data.subjectUserId),
            name: logsCard.title.trim() || CARD_LABELS[logsCard.cardType],
            scopeLabel: criticalScopeLabel(activeModule, logsCard.cardType),
            card:
              logsCard.cardType === "critical"
                ? moduleCards.critical
                : moduleCards.balancing,
            entry: entryFor(logsCard.cardType),
          }}
          config={criticalReviewAuditConfig}
          onClose={() => setLogsCard(null)}
        />
      )}
    </div>
  );
}
