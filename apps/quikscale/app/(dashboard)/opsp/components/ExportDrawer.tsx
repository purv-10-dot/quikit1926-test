"use client";

/**
 * Export → Create KPIs / Export → Create Priorities.
 *
 * Launched from the OPSP page's Your-Accountability / Quarterly-Priorities
 * sections. Walks one step per FILLED row (a stepper), each step a form
 * prefilled from the row + sensible defaults, and on the final step submits
 * every row into the KPI / Priority module.
 *
 * Reuses the shared building blocks rather than re-implementing them:
 *   - RightPanel chrome (@quikit/ui)
 *   - buildBreakdown + WeeklyScroller (KPI weekly target distribution)
 *   - useCreateKPI / useCreatePriority (mutations + cache invalidation)
 *   - UserPicker + useInfiniteUsers (owner selection)
 */

import { useEffect, useMemo, useRef, useState } from "react";
import {
  RightPanel,
  RightPanelFooter,
  RightPanelCancelButton,
  RightPanelSubmitButton,
  UserPicker,
  type PickerUser,
} from "@quikit/ui";
import { useQueryClient } from "@tanstack/react-query";
import { useInfiniteUsers } from "@/lib/hooks/useInfiniteUsers";
import { useCreateKPI } from "@/lib/hooks/useKPI";
import { useCreatePriority } from "@/lib/hooks/usePriority";
import { invalidateEntity } from "@/lib/hooks/dashboardInvalidation";
import { useExportGate, type DuplicateDecision } from "./ExportGateModals";
import { useCurrentWeek, useWeekLabels } from "@/lib/hooks/useCurrentWeek";
import { usePastWeekFlags } from "@/lib/hooks/useFeatureFlags";
import { buildBreakdown, applyWeeklyEdit } from "../../kpi/components/kpiModalHelpers";
import { WeeklyScroller } from "../../kpi/components/WeeklyScroller";
import { ALL_WEEKS, fiscalYearLabel } from "@/lib/utils/fiscal";
import { PRIORITY_DEFAULT_STATUS } from "@/lib/constants/status";
import { notify } from "@/lib/utils/notify";
import {
  rebuildStepWeekly,
  isWeekBlocked,
  categorizeKpiRows,
  categorizePriorityRows,
  type ExistingExportItem,
} from "../lib/exportHelpers";
import type { KPIAcctRow, QPriorRow } from "../types";

/* ── shared bits ───────────────────────────────────────────────────────── */

interface BaseProps {
  open: boolean;
  onClose: () => void;
  year: number;
  quarter: string;
  /** Owner of the created records — the OPSP section user (self or picked). */
  ownerId: string;
  /** Display name for the default owner so the picker label resolves. */
  ownerName: string;
}

function ownerSeed(ownerId: string, ownerName: string): PickerUser[] {
  if (!ownerId) return [];
  const parts = (ownerName || "").trim().split(/\s+/);
  return [{ id: ownerId, firstName: parts[0] ?? ownerName ?? "", lastName: parts.slice(1).join(" "), email: "" }];
}

function StepDots({ total, step }: { total: number; step: number }) {
  return (
    <div className="flex items-center gap-1.5 mb-4">
      {Array.from({ length: total }).map((_, i) => (
        <div key={i} className="flex items-center gap-1.5 flex-1 last:flex-none">
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 ${
              i < step
                ? "bg-green-500 text-white"
                : i === step
                  ? "bg-accent-600 text-white"
                  : "bg-gray-200 text-gray-500"
            }`}
          >
            {i < step ? "✓" : i + 1}
          </div>
          {i < total - 1 && <div className={`h-0.5 flex-1 ${i < step ? "bg-green-500" : "bg-gray-200"}`} />}
        </div>
      ))}
    </div>
  );
}

const fieldLabel = "text-xs font-semibold text-gray-700 block mb-1.5";
const inputCls =
  "w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-accent-400";

/** Footer left button: Cancel on the first step, plain "← Back" otherwise. */
function BackOrCancel({ step, onBack, onCancel }: { step: number; onBack: () => void; onCancel: () => void }) {
  if (step === 0) return <RightPanelCancelButton onClick={onCancel} />;
  return (
    <button
      type="button"
      onClick={onBack}
      className="px-4 py-2 text-xs border border-gray-200 rounded-lg hover:bg-gray-50 text-gray-600 font-semibold"
    >
      ← Back
    </button>
  );
}

/**
 * Post-submit toast summary, accounting for the duplicate decision.
 * `total` is the number of flagged duplicates considered.
 */
function summaryLine(
  entity: "KPI" | "Priority",
  created: number,
  replaced: number,
  flagged: number,
  decision: DuplicateDecision,
): string {
  const plural = entity === "KPI" ? "KPIs" : "priorities";
  const one = entity === "KPI" ? "KPI" : "priority";
  const noun = (n: number) => (n === 1 ? one : plural);
  const parts: string[] = [];
  if (created > 0) parts.push(`${created} ${noun(created)} added`);
  if (replaced > 0) parts.push(`${replaced} replaced`);
  if (decision === "skip" && flagged > 0) parts.push(`${flagged} skipped`);
  return parts.length ? parts.join(" · ") : `No ${plural} created`;
}

/** Two-tab switcher for the export drawer: New to add ↔ Previously Exported. */
function ExportTabBar({
  exportedCount,
  newCount,
  tab,
  onTab,
}: {
  exportedCount: number;
  newCount: number;
  tab: "new" | "exported";
  onTab: (t: "new" | "exported") => void;
}) {
  const btn = (active: boolean) =>
    `flex-1 px-3 py-1.5 text-xs font-semibold rounded-md ${
      active ? "bg-accent-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
    }`;
  return (
    <div className="flex gap-1.5 mb-4 p-1 bg-gray-50 rounded-lg border border-gray-200">
      <button type="button" className={btn(tab === "new")} onClick={() => onTab("new")}>
        New to add ({newCount})
      </button>
      <button type="button" className={btn(tab === "exported")} onClick={() => onTab("exported")}>
        Previously Exported ({exportedCount})
      </button>
    </div>
  );
}

interface ExportedListItem {
  attemptedName: string;
  existingName: string;
  detail?: string | null;
}

/** Read-only list of rows already exported (shown in the Previously-Exported tab). */
function PreviouslyExportedList({ entity, items }: { entity: "KPI" | "Priority"; items: ExportedListItem[] }) {
  if (items.length === 0) {
    return <p className="text-xs text-gray-400 py-6 text-center">No previously exported {entity}s.</p>;
  }
  return (
    <div className="space-y-2">
      <p className="text-xs text-gray-500">
        These rows were already exported to the {entity} module and won&apos;t be created again.
      </p>
      <ul className="space-y-2">
        {items.map((d, i) => (
          <li key={i} className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-[11px] text-gray-700">
            <span className="font-semibold">“{d.attemptedName}”</span>
            {d.existingName && d.existingName !== d.attemptedName ? (
              <span className="text-gray-500"> → existing “{d.existingName}”</span>
            ) : null}
            {d.detail ? <div className="mt-0.5 text-gray-400">{d.detail}</div> : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** One-line read-only summary of an existing KPI for the Previously-Exported tab. */
function kpiExistingDetail(k: ExistingExportItem): string {
  const parts: string[] = [];
  if (k.measurementUnit) parts.push(k.measurementUnit);
  if (k.target != null) parts.push(`target ${k.target}`);
  if (k.divisionType) parts.push(k.divisionType);
  if (k.frequency) parts.push(k.frequency);
  return parts.join(" · ");
}

/* ── Export → KPI ──────────────────────────────────────────────────────── */

interface KPIStepForm {
  name: string;
  owner: string;
  target: string;
  measurementUnit: "Number" | "Percentage" | "Currency";
  divisionType: "Cumulative" | "Standalone";
  reverseColor: boolean;
  frequency: "daily" | "weekly" | "monthly" | "yearly";
  description: string;
  weekly: Record<number, string>;
}

/** Existing KPI returned by the duplicate-check endpoint. */
interface ExistingKPI {
  id: string;
  name: string;
  measurementUnit: string;
  target: number | null;
  divisionType: string;
  frequency: string;
  reverseColor: boolean;
  description: string | null;
  /** Owner display name — the match may belong to another user. */
  ownerName?: string | null;
}

/**
 * Ask the AI similarity-check endpoint whether this KPI resembles an existing
 * one (across users). Returns the existing KPI on a match, the sentinel
 * "ai-unavailable" when the check could not run, or null when nothing similar
 * was found. Errors degrade to "ai-unavailable" — the check never blocks.
 */
async function checkDuplicate(
  form: KPIStepForm,
  quarter: string,
  year: number,
): Promise<ExistingKPI | "ai-unavailable" | null> {
  try {
    const res = await fetch("/api/kpi/duplicate-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        owner: form.owner,
        quarter,
        year,
        frequency: form.frequency,
        measurementUnit: form.measurementUnit,
        target: parseFloat(form.target) || 0,
        divisionType: form.divisionType,
        reverseColor: form.reverseColor,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) return "ai-unavailable";
    if (json.data?.aiUnavailable) return "ai-unavailable";
    if (json.data?.match) return json.data.match as ExistingKPI;
    return null;
  } catch {
    return "ai-unavailable";
  }
}

/** One-line context string for the warning modal. */
function kpiDetail(k: ExistingKPI): string {
  const parts = [k.measurementUnit];
  if (k.target != null) parts.push(`target ${k.target}`);
  parts.push(k.divisionType, k.frequency);
  return parts.join(" · ");
}

export function ExportKPIDrawer({
  open,
  onClose,
  year,
  quarter,
  ownerId,
  ownerName,
  rows,
}: BaseProps & { rows: KPIAcctRow[] }) {
  const createKPI = useCreateKPI();
  const currentWeek = useCurrentWeek(year, quarter);
  // Distribution starts at the current fiscal week (earlier weeks get 0),
  // identical to the Add-New-KPI modal. `useCurrentWeek` resolves async, so
  // this is 1 on the first render and the resolve-effect below recomputes
  // every un-edited step once the real week lands.
  const firstEditableWeek = currentWeek !== null && currentWeek > 1 ? currentWeek : 1;
  const weekLabels = useWeekLabels(year, quarter);
  // "Add Past Week Data" governs editability of past cells, NOT the default
  // distribution (which always starts at the current week) — mirroring the
  // KPI modal. Export is a create flow, so it follows canAddPastWeek.
  const { canAddPastWeek, loaded: flagsLoaded } = usePastWeekFlags();
  const pastWeekAllowed = flagsLoaded && canAddPastWeek;

  const [search, setSearch] = useState("");
  const infinite = useInfiniteUsers(undefined, search);

  const queryClient = useQueryClient();
  const gate = useExportGate();

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Previously-exported detection: fetch this owner's existing individual KPIs
  // for the quarter, then split the OPSP rows into already-exported vs new.
  // `null` = still loading; failure falls open ([] → treat every row as new).
  const [existingKpis, setExistingKpis] = useState<ExistingExportItem[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setExistingKpis(null);
    (async () => {
      try {
        const qs = `owner=${encodeURIComponent(ownerId)}&quarter=${quarter}&year=${year}`;
        const res = await fetch(`/api/kpi/exported-lookup?${qs}`);
        const json = await res.json().catch(() => null);
        const list: ExistingExportItem[] = json?.success
          ? (json.data?.items ?? []).map(
              (k: {
                id: string;
                name: string;
                target: number | null;
                importedFromOpsp?: boolean;
                measurementUnit?: string;
                divisionType?: string;
                frequency?: string;
              }) => ({
                id: k.id,
                name: k.name,
                target: k.target ?? null,
                importedFromOpsp: k.importedFromOpsp,
                measurementUnit: k.measurementUnit,
                divisionType: k.divisionType,
                frequency: k.frequency,
              }),
            )
          : [];
        if (!cancelled) setExistingKpis(list);
      } catch {
        if (!cancelled) setExistingKpis([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ownerId, quarter, year]);

  const { alreadyExported, newRows } = useMemo(
    () => categorizeKpiRows(rows, existingKpis ?? []),
    [rows, existingKpis],
  );

  const [tab, setTab] = useState<"new" | "exported">("new");

  // The stepper operates on the NEW rows only; seed it once existing KPIs load.
  const [forms, setForms] = useState<KPIStepForm[]>([]);
  const seededRef = useRef(false);
  useEffect(() => {
    if (existingKpis === null || seededRef.current) return;
    seededRef.current = true;
    setForms(
      newRows.map(({ row, target }) => ({
        name: row.kpi.trim(),
        owner: ownerId,
        target: target > 0 ? String(target) : "",
        measurementUnit: "Number" as const,
        divisionType: "Cumulative" as const,
        reverseColor: false,
        frequency: "weekly" as const,
        description: "",
        weekly: buildBreakdown("Cumulative", target, "Number", firstEditableWeek),
      })),
    );
    setStep(0);
    setTab(newRows.length > 0 ? "new" : "exported");
  }, [existingKpis, newRows, ownerId, firstEditableWeek]);

  const total = forms.length;
  const cur = forms[step];

  const patch = (p: Partial<KPIStepForm>) =>
    setForms((fs) => fs.map((f, i) => (i === step ? { ...f, ...p } : f)));

  // Recompute the weekly distribution when target / division / unit changes.
  const recompute = (next: Partial<KPIStepForm>) => {
    const merged = { ...cur, ...next };
    const t = parseFloat(merged.target) || 0;
    patch({ ...next, weekly: buildBreakdown(merged.divisionType, t, merged.measurementUnit, firstEditableWeek) });
  };

  // Steps whose weekly cells the user hand-edited — never clobber those.
  const editedWeekly = useRef<Set<number>>(new Set());
  const markWeeklyEdited = (i: number) => editedWeekly.current.add(i);

  // Raw text of the cell currently being typed, so keystrokes aren't reformatted
  // mid-edit (matches the KPI modal's `editingCell`). Keyed by step + week.
  const [editingCell, setEditingCell] = useState<{ key: string; raw: string } | null>(null);

  // `useCurrentWeek` resolves asynchronously; the initial `weekly` seed was
  // built at firstEditableWeek=1 (all 13 weeks). When the real current week
  // lands, re-derive every un-edited step's breakdown once — matching the
  // KPI modal's "firstEditableWeek resolved" recalculation.
  const weekResolved = useRef(false);
  useEffect(() => {
    if (weekResolved.current || firstEditableWeek <= 1) return;
    weekResolved.current = true;
    setForms((fs) => rebuildStepWeekly(fs, firstEditableWeek, (i) => editedWeekly.current.has(i)));
  }, [firstEditableWeek]);

  /** Build the create payload for one step form. */
  function kpiCreatePayload(f: KPIStepForm) {
    const targetNum = parseFloat(f.target) || 0;
    return {
      name: f.name.trim(),
      description: f.description || undefined,
      kpiLevel: "individual",
      owner: f.owner,
      quarter: quarter as "Q1" | "Q2" | "Q3" | "Q4",
      year,
      measurementUnit: f.measurementUnit,
      target: targetNum,
      quarterlyGoal: targetNum,
      qtdGoal: targetNum,
      status: "active",
      divisionType: f.divisionType,
      reverseColor: f.reverseColor,
      frequency: f.frequency,
      importedFromOpsp: true,
      weeklyTargets: Object.fromEntries(
        ALL_WEEKS.map((w) => [String(w), parseFloat(f.weekly[w]) || 0]),
      ),
    } as Parameters<typeof createKPI.mutateAsync>[0];
  }

  /** Replace = overwrite the matched existing KPI with the new values. */
  async function replaceKPI(id: string, f: KPIStepForm) {
    const { kpiLevel: _lvl, status: _st, quarter: _q, year: _y, ...rest } = kpiCreatePayload(f) as Record<string, unknown>;
    const res = await fetch(`/api/kpi/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(rest),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to replace KPI");
    invalidateEntity(queryClient, "kpi", { id });
  }

  async function submitAll() {
    if (saving) return;
    setSaving(true);
    try {
      // Phase 1 — scan every form against the AI similarity check.
      const matches = new Map<number, ExistingKPI>();
      let aiUnavailable = false;
      for (let i = 0; i < forms.length; i++) {
        const r = await checkDuplicate(forms[i], quarter, year);
        if (r === "ai-unavailable") aiUnavailable = true;
        else if (r) matches.set(i, r);
      }

      // Phase 2a — token-expired fallback. AI never blocks: ask, then export.
      if (aiUnavailable) {
        const proceed = await gate.askTokenExpired("KPI");
        if (!proceed) return;
        for (const f of forms) await createKPI.mutateAsync(kpiCreatePayload(f));
        notify.success(`${forms.length} KPI${forms.length !== 1 ? "s" : ""} added to the KPI module`);
        onClose();
        return;
      }

      // Phase 2b — duplicate warning (Cancel · Skip · Replace).
      let decision: DuplicateDecision = "skip";
      if (matches.size > 0) {
        decision = await gate.askDuplicates(
          "KPI",
          [...matches.entries()].map(([i, ex]) => ({
            attemptedName: forms[i].name.trim(),
            existingName: ex.name,
            ownerName: ex.ownerName,
            detail: kpiDetail(ex),
          })),
        );
        if (decision === "cancel") return;
      }

      // Phase 3 — apply the decision.
      let created = 0;
      let replaced = 0;
      for (let i = 0; i < forms.length; i++) {
        const ex = matches.get(i);
        if (ex && decision === "skip") continue;
        if (ex && decision === "replace") {
          await replaceKPI(ex.id, forms[i]);
          replaced++;
          continue;
        }
        await createKPI.mutateAsync(kpiCreatePayload(forms[i]));
        created++;
      }

      notify.success(summaryLine("KPI", created, replaced, matches.size, decision));
      onClose();
    } catch (err) {
      notify.error(err, { context: "KPI" });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  const last = step === total - 1;
  const showStepper = tab === "new" && total > 0 && !!cur;

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      size="sm"
      title="Export → Create KPIs"
      subtitle={`${fiscalYearLabel(year)} · ${quarter}`}
      footer={
        <RightPanelFooter>
          {showStepper ? (
            <>
              <BackOrCancel step={step} onBack={() => setStep((s) => s - 1)} onCancel={onClose} />
              {last ? (
                <RightPanelSubmitButton onClick={submitAll} saving={saving} icon="check" label={`Submit ${total} KPI${total > 1 ? "s" : ""}`} />
              ) : (
                <RightPanelSubmitButton onClick={() => setStep((s) => s + 1)} icon="none" label="Next →" />
              )}
            </>
          ) : (
            <RightPanelCancelButton onClick={onClose} />
          )}
        </RightPanelFooter>
      }
    >
      {gate.modals}
      {alreadyExported.length > 0 && (
        <ExportTabBar exportedCount={alreadyExported.length} newCount={total} tab={tab} onTab={setTab} />
      )}
      {existingKpis === null ? (
        <p className="text-xs text-gray-400 py-6 text-center">Checking for previously exported KPIs…</p>
      ) : tab === "exported" ? (
        <PreviouslyExportedList
          entity="KPI"
          items={alreadyExported.map((c) => ({
            attemptedName: c.row.kpi.trim(),
            existingName: c.existing?.name ?? c.row.kpi.trim(),
            detail: c.existing ? kpiExistingDetail(c.existing) : null,
          }))}
        />
      ) : total === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">
          All Accountability rows have already been exported to KPI — nothing new to add.
        </p>
      ) : !cur ? null : (
        <>
      <StepDots total={total} step={step} />
      <p className="text-xs text-gray-500 mb-3">
        Step {step + 1} of {total} — KPI from “{cur.name}”
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={fieldLabel}>KPI Name <span className="text-red-500">*</span></label>
          <input className={inputCls} value={cur.name} onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div>
          <label className={fieldLabel}>Owner <span className="text-red-500">*</span></label>
          {/* Owner is fixed to the OPSP section's user — read-only at export. */}
          <UserPicker
            value={cur.owner}
            onChange={(id) => patch({ owner: id })}
            users={infinite.users as unknown as PickerUser[]}
            selectedUsers={ownerSeed(ownerId, ownerName)}
            onSearchChange={setSearch}
            onLoadMore={infinite.fetchNextPage}
            hasMore={infinite.hasNextPage}
            loadingMore={infinite.isFetchingNextPage}
            loading={infinite.isLoading}
            disabled
          />
        </div>
        <div>
          <label className={fieldLabel}>Quarter <span className="text-red-500">*</span></label>
          <input className={`${inputCls} bg-gray-50 text-gray-500`} value={`${fiscalYearLabel(year)} · ${quarter}`} disabled />
        </div>
        <div>
          <label className={fieldLabel}>Frequency <span className="text-red-500">*</span></label>
          <select className={inputCls} value={cur.frequency} onChange={(e) => patch({ frequency: e.target.value as KPIStepForm["frequency"] })}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
            <option value="yearly">Yearly</option>
          </select>
        </div>
        <div>
          <label className={fieldLabel}>Measurement Unit <span className="text-red-500">*</span></label>
          <select className={inputCls} value={cur.measurementUnit} onChange={(e) => recompute({ measurementUnit: e.target.value as KPIStepForm["measurementUnit"] })}>
            <option value="Number">Number</option>
            <option value="Percentage">Percentage</option>
            <option value="Currency">Currency</option>
          </select>
        </div>
        <div>
          <label className={fieldLabel}>Target Value <span className="text-red-500">*</span></label>
          <input className={inputCls} value={cur.target} inputMode="decimal" placeholder="0" onChange={(e) => recompute({ target: e.target.value })} />
        </div>
      </div>

      <div className="mt-3">
        <label className={fieldLabel}>Division Type <span className="text-red-500">*</span></label>
        <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden">
          {(["Cumulative", "Standalone"] as const).map((dt) => (
            <button
              key={dt}
              type="button"
              onClick={() => recompute({ divisionType: dt })}
              className={`px-3.5 py-2 text-xs font-semibold ${cur.divisionType === dt ? "bg-gray-900 text-white" : "bg-white text-gray-700"}`}
            >
              {dt}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-gray-400 mt-1">
          {cur.divisionType === "Cumulative" ? "Target split equally across 13 weeks" : "Full target every week"}
        </p>
      </div>

      <div className="mt-3">
        <label className={fieldLabel}>Color Coding <span className="text-red-500">*</span></label>
        <div className="inline-flex border border-gray-200 rounded-lg overflow-hidden">
          {[
            { v: false, l: "Higher is Better" },
            { v: true, l: "Lower is Better" },
          ].map((o) => (
            <button
              key={o.l}
              type="button"
              onClick={() => patch({ reverseColor: o.v })}
              className={`px-3.5 py-2 text-xs font-semibold ${cur.reverseColor === o.v ? "bg-gray-900 text-white" : "bg-white text-gray-700"}`}
            >
              {o.l}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <label className={fieldLabel}>Description</label>
        <textarea className={inputCls} rows={2} value={cur.description} placeholder="Enter description…" onChange={(e) => patch({ description: e.target.value })} />
      </div>

      {/* Target Breakdown (Weekly) */}
      <div className="mt-4">
        <label className={fieldLabel}>Target Breakdown (Weekly)</label>
        <WeeklyScroller>
          <table className="border-collapse">
            <thead>
              <tr className="bg-gray-50">
                {ALL_WEEKS.map((w) => (
                  <th key={w} className="px-2 py-1.5 text-[10px] font-semibold text-gray-500 text-center min-w-[64px] border-r border-gray-100 last:border-r-0">
                    W{w}
                    <div className="text-[9px] font-normal text-gray-400">{weekLabels[w - 1] ?? ""}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              <tr>
                {ALL_WEEKS.map((w) => {
                  // Cell rules mirror the Individual KPI modal exactly:
                  //  - Past weeks are blocked (0) unless "Add Past Week Data" is on.
                  //  - Standalone cells are LOCKED at the full target (each week
                  //    independently carries it); only a past week with the toggle
                  //    on becomes an editable 0 / full-target dropdown.
                  //  - Cumulative cells are editable and auto-redistribute.
                  const isPast = isWeekBlocked(w, firstEditableWeek, pastWeekAllowed);
                  const isStandalone = cur.divisionType === "Standalone";
                  const isLocked = isStandalone || isPast;
                  const cellKey = `${step}-${w}`;
                  const targetNum = parseFloat(cur.target) || 0;

                  const applyEdit = (raw: string) => {
                    markWeeklyEdited(step);
                    patch({
                      weekly: applyWeeklyEdit(cur.weekly, w, raw, targetNum, cur.measurementUnit, cur.divisionType),
                    });
                  };

                  // Standalone past week + toggle on → editable 0 / full-target select.
                  const isStandalonePastEditable =
                    isStandalone && currentWeek != null && w < currentWeek && pastWeekAllowed;
                  if (isStandalonePastEditable) {
                    const isNumUnit = cur.measurementUnit === "Number";
                    const zeroStr = isNumUnit ? "0" : "0.00";
                    const targetStr = targetNum > 0 ? (isNumUnit ? String(Math.round(targetNum)) : targetNum.toFixed(2)) : "";
                    const current = cur.weekly[w] ?? "";
                    const currentNum = parseFloat(current) || 0;
                    const norm =
                      currentNum === 0 || current === ""
                        ? zeroStr
                        : targetStr && Math.abs(currentNum - targetNum) < 0.001
                          ? targetStr
                          : current;
                    return (
                      <td key={w} className="px-1 py-1 border-r border-gray-100 last:border-r-0">
                        <select
                          value={norm}
                          onChange={(e) => applyEdit(e.target.value)}
                          className="w-full text-xs text-center border border-gray-200 rounded px-1 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400 cursor-pointer"
                        >
                          <option value={zeroStr}>0</option>
                          <option value={targetStr}>{targetStr || "—"}</option>
                          {norm !== zeroStr && norm !== "" && norm !== targetStr && (
                            <option value={norm}>{norm} (custom)</option>
                          )}
                        </select>
                      </td>
                    );
                  }

                  return (
                    <td key={w} className="px-1 py-1 border-r border-gray-100 last:border-r-0">
                      <input
                        type="number"
                        min="0"
                        value={editingCell?.key === cellKey ? editingCell.raw : cur.weekly[w] ?? ""}
                        readOnly={isLocked}
                        onChange={(e) => {
                          setEditingCell({ key: cellKey, raw: e.target.value });
                          applyEdit(e.target.value);
                        }}
                        onBlur={() => setEditingCell(null)}
                        title={isPast ? "Past week data entry is disabled. Enable in Settings > Configurations." : undefined}
                        className={`w-full text-xs text-center border border-gray-200 rounded px-1 py-1 focus:outline-none focus:ring-1 focus:ring-accent-400 ${
                          isLocked ? "bg-gray-50 text-gray-400 cursor-not-allowed" : ""
                        }`}
                      />
                    </td>
                  );
                })}
              </tr>
            </tbody>
          </table>
        </WeeklyScroller>
        <p className="text-[10px] text-gray-400 mt-1">
          {cur.divisionType === "Cumulative"
            ? `Target split equally across ${firstEditableWeek > 1 ? `weeks ${firstEditableWeek}–13 (${14 - firstEditableWeek} weeks)` : "13 weeks"} — edit cells to override`
            : `Each week = full target (${parseFloat(cur.target) || 0})`}
        </p>
      </div>

      <div className="mt-3 bg-accent-50 border border-accent-100 text-accent-700 text-xs rounded-lg px-3 py-2">
        Defaults prefilled from your Accountability row — edit anything before submit.
      </div>
        </>
      )}
    </RightPanel>
  );
}

/* ── Export → Priority ─────────────────────────────────────────────────── */

interface PriorityStepForm {
  name: string;
  owner: string;
  startWeek: number;
  endWeek: number;
  description: string;
}

/** Existing Priority returned by the duplicate-check endpoint. */
interface ExistingPriority {
  id: string;
  name: string;
  startWeek: number | null;
  endWeek: number | null;
  description: string | null;
  /** Owner display name — the match may belong to another user. */
  ownerName?: string | null;
}

/**
 * Ask the AI similarity-check endpoint whether this priority resembles an
 * existing one (across users). Returns the existing priority on a match,
 * "ai-unavailable" when the check could not run, or null when nothing similar
 * was found. Errors degrade to "ai-unavailable" — the check never blocks.
 */
async function checkPriorityDuplicate(
  form: PriorityStepForm,
  quarter: string,
  year: number,
): Promise<ExistingPriority | "ai-unavailable" | null> {
  try {
    const res = await fetch("/api/priority/duplicate-check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: form.name.trim(),
        owner: form.owner,
        quarter,
        year,
        startWeek: form.startWeek,
        endWeek: form.endWeek,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) return "ai-unavailable";
    if (json.data?.aiUnavailable) return "ai-unavailable";
    if (json.data?.match) return json.data.match as ExistingPriority;
    return null;
  } catch {
    return "ai-unavailable";
  }
}

/** One-line context string for the warning modal. */
function priorityDetail(p: ExistingPriority): string | null {
  if (p.startWeek != null && p.endWeek != null) return `weeks ${p.startWeek}–${p.endWeek}`;
  return null;
}

export function ExportPriorityDrawer({
  open,
  onClose,
  year,
  quarter,
  ownerId,
  ownerName,
  rows,
}: BaseProps & { rows: QPriorRow[] }) {
  const createPriority = useCreatePriority();
  const queryClient = useQueryClient();
  const gate = useExportGate();
  const [search, setSearch] = useState("");
  const infinite = useInfiniteUsers(undefined, search);

  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);

  // Previously-exported detection — fetch this owner's existing priorities for
  // the quarter, then split the OPSP rows into already-exported vs new.
  const [existingPriorities, setExistingPriorities] = useState<ExistingExportItem[] | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setExistingPriorities(null);
    (async () => {
      try {
        const qs = `owner=${encodeURIComponent(ownerId)}&quarter=${quarter}&year=${year}`;
        const res = await fetch(`/api/priority/exported-lookup?${qs}`);
        const json = await res.json().catch(() => null);
        const raw = json?.success ? (json.data?.items ?? []) : [];
        const list: ExistingExportItem[] = raw.map(
          (p: { id: string; name: string; importedFromOpsp?: boolean; startWeek?: number | null; endWeek?: number | null }) => ({
            id: p.id,
            name: p.name,
            importedFromOpsp: p.importedFromOpsp,
            startWeek: p.startWeek ?? null,
            endWeek: p.endWeek ?? null,
          }),
        );
        if (!cancelled) setExistingPriorities(list);
      } catch {
        if (!cancelled) setExistingPriorities([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ownerId, quarter, year]);

  const { alreadyExported, newRows } = useMemo(
    () => categorizePriorityRows(rows, existingPriorities ?? []),
    [rows, existingPriorities],
  );

  const [tab, setTab] = useState<"new" | "exported">("new");

  const [forms, setForms] = useState<PriorityStepForm[]>([]);
  const seededRef = useRef(false);
  useEffect(() => {
    if (existingPriorities === null || seededRef.current) return;
    seededRef.current = true;
    setForms(
      newRows.map(({ row }) => ({
        name: row.priority.trim(),
        owner: ownerId,
        startWeek: 1,
        endWeek: 13,
        description: "",
      })),
    );
    setStep(0);
    setTab(newRows.length > 0 ? "new" : "exported");
  }, [existingPriorities, newRows, ownerId]);

  const total = forms.length;
  const cur = forms[step];
  const patch = (p: Partial<PriorityStepForm>) =>
    setForms((fs) => fs.map((f, i) => (i === step ? { ...f, ...p } : f)));

  function priorityCreatePayload(f: PriorityStepForm) {
    return {
      name: f.name.trim(),
      description: f.description || undefined,
      owner: f.owner,
      quarter,
      year,
      startWeek: f.startWeek,
      endWeek: f.endWeek,
      overallStatus: PRIORITY_DEFAULT_STATUS,
      importedFromOpsp: true,
    } as Parameters<typeof createPriority.mutateAsync>[0];
  }

  /** Replace = overwrite the matched existing priority with the new values. */
  async function replacePriority(id: string, f: PriorityStepForm) {
    const res = await fetch(`/api/priority/${id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: f.name.trim(),
        description: f.description || undefined,
        owner: f.owner,
        startWeek: f.startWeek,
        endWeek: f.endWeek,
      }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok || !json?.success) throw new Error(json?.error || "Failed to replace priority");
    invalidateEntity(queryClient, "priority", { id });
  }

  async function submitAll() {
    if (saving) return;
    setSaving(true);
    try {
      // Phase 1 — scan every form against the AI similarity check.
      const matches = new Map<number, ExistingPriority>();
      let aiUnavailable = false;
      for (let i = 0; i < forms.length; i++) {
        const r = await checkPriorityDuplicate(forms[i], quarter, year);
        if (r === "ai-unavailable") aiUnavailable = true;
        else if (r) matches.set(i, r);
      }

      // Phase 2a — token-expired fallback. AI never blocks: ask, then export.
      if (aiUnavailable) {
        const proceed = await gate.askTokenExpired("Priority");
        if (!proceed) return;
        for (const f of forms) await createPriority.mutateAsync(priorityCreatePayload(f));
        notify.success(`${forms.length} Priorit${forms.length !== 1 ? "ies" : "y"} added to the Priority module`);
        onClose();
        return;
      }

      // Phase 2b — duplicate warning (Cancel · Skip · Replace).
      let decision: DuplicateDecision = "skip";
      if (matches.size > 0) {
        decision = await gate.askDuplicates(
          "Priority",
          [...matches.entries()].map(([i, ex]) => ({
            attemptedName: forms[i].name.trim(),
            existingName: ex.name,
            ownerName: ex.ownerName,
            detail: priorityDetail(ex),
          })),
        );
        if (decision === "cancel") return;
      }

      // Phase 3 — apply the decision.
      let created = 0;
      let replaced = 0;
      for (let i = 0; i < forms.length; i++) {
        const ex = matches.get(i);
        if (ex && decision === "skip") continue;
        if (ex && decision === "replace") {
          await replacePriority(ex.id, forms[i]);
          replaced++;
          continue;
        }
        await createPriority.mutateAsync(priorityCreatePayload(forms[i]));
        created++;
      }

      notify.success(summaryLine("Priority", created, replaced, matches.size, decision));
      onClose();
    } catch (err) {
      notify.error(err, { context: "Priority" });
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;
  const last = step === total - 1;
  const showStepper = tab === "new" && total > 0 && !!cur;

  return (
    <RightPanel
      open={open}
      onClose={onClose}
      size="sm"
      title="Export → Create Priorities"
      subtitle={`${fiscalYearLabel(year)} · ${quarter}`}
      footer={
        <RightPanelFooter>
          {showStepper ? (
            <>
              <BackOrCancel step={step} onBack={() => setStep((s) => s - 1)} onCancel={onClose} />
              {last ? (
                <RightPanelSubmitButton onClick={submitAll} saving={saving} icon="check" label={`Submit ${total} Priorit${total > 1 ? "ies" : "y"}`} />
              ) : (
                <RightPanelSubmitButton onClick={() => setStep((s) => s + 1)} icon="none" label="Next →" />
              )}
            </>
          ) : (
            <RightPanelCancelButton onClick={onClose} />
          )}
        </RightPanelFooter>
      }
    >
      {gate.modals}
      {alreadyExported.length > 0 && (
        <ExportTabBar exportedCount={alreadyExported.length} newCount={total} tab={tab} onTab={setTab} />
      )}
      {existingPriorities === null ? (
        <p className="text-xs text-gray-400 py-6 text-center">Checking for previously exported priorities…</p>
      ) : tab === "exported" ? (
        <PreviouslyExportedList
          entity="Priority"
          items={alreadyExported.map((c) => ({
            attemptedName: c.row.priority.trim(),
            existingName: c.existing?.name ?? c.row.priority.trim(),
            detail:
              c.existing?.startWeek != null && c.existing?.endWeek != null
                ? `weeks ${c.existing.startWeek}–${c.existing.endWeek}`
                : null,
          }))}
        />
      ) : total === 0 ? (
        <p className="text-xs text-gray-500 py-6 text-center">
          All Quarterly Priorities have already been exported — nothing new to add.
        </p>
      ) : !cur ? null : (
        <>
      <StepDots total={total} step={step} />
      <p className="text-xs text-gray-500 mb-3">
        Step {step + 1} of {total} — Priority from “{cur.name}”
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2">
          <label className={fieldLabel}>Priority Name <span className="text-red-500">*</span></label>
          <input className={inputCls} value={cur.name} onChange={(e) => patch({ name: e.target.value })} />
        </div>
        <div>
          <label className={fieldLabel}>Owner <span className="text-red-500">*</span></label>
          {/* Owner is fixed to the OPSP section's user — read-only at export. */}
          <UserPicker
            value={cur.owner}
            onChange={(id) => patch({ owner: id })}
            users={infinite.users as unknown as PickerUser[]}
            selectedUsers={ownerSeed(ownerId, ownerName)}
            onSearchChange={setSearch}
            onLoadMore={infinite.fetchNextPage}
            hasMore={infinite.hasNextPage}
            loadingMore={infinite.isFetchingNextPage}
            loading={infinite.isLoading}
            disabled
          />
        </div>
        <div>
          <label className={fieldLabel}>Quarter <span className="text-red-500">*</span></label>
          <input className={`${inputCls} bg-gray-50 text-gray-500`} value={`${fiscalYearLabel(year)} · ${quarter}`} disabled />
        </div>
        <div>
          <label className={fieldLabel}>Start Week <span className="text-red-500">*</span></label>
          <select className={inputCls} value={cur.startWeek} onChange={(e) => patch({ startWeek: Number(e.target.value) })}>
            {ALL_WEEKS.map((w) => <option key={w} value={w}>Week {w}</option>)}
          </select>
        </div>
        <div>
          <label className={fieldLabel}>End Week <span className="text-red-500">*</span></label>
          <select className={inputCls} value={cur.endWeek} onChange={(e) => patch({ endWeek: Number(e.target.value) })}>
            {ALL_WEEKS.filter((w) => w >= cur.startWeek).map((w) => <option key={w} value={w}>Week {w}</option>)}
          </select>
        </div>
        <div className="col-span-2">
          <label className={fieldLabel}>Description</label>
          <textarea className={inputCls} rows={2} value={cur.description} placeholder="Enter description…" onChange={(e) => patch({ description: e.target.value })} />
        </div>
      </div>

      <div className="mt-3 bg-accent-50 border border-accent-100 text-accent-700 text-xs rounded-lg px-3 py-2">
        Prefilled from your Quarterly Priority — adjust before submit.
      </div>
        </>
      )}
    </RightPanel>
  );
}
