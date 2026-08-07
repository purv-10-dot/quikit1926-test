"use client";

/**
 * FR-RE Stage 2b — the clean disposition form, now a TABBED interface.
 *
 * The whole modal is one tab strip at the top:
 *   Tab 1 "Call Disposition" — the main form (Contact Stage, Status, Sub-Stage,
 *     Activity DateTime, Notes, and any unassigned custom fields). Status is the
 *     rule trigger and always lives here.
 *   Tab 2..N — each rule-revealed custom tab (e.g. "Payment Form"), in sortOrder,
 *     appearing only once a rule reveals it (show_tab) and it has a visible field.
 *
 * Auto-switch: when a rule reveals a NEW tab, the active tab jumps to it so the
 * agent lands on the revealed form without clicking. If the current status
 * reveals no custom tab, the active tab returns to "Call Disposition". The agent
 * can always click back to "Call Disposition" to change Status.
 *
 * Save / Cancel / error / the "rule will set stage" hint sit BELOW the tab panel,
 * always visible regardless of the active tab.
 */
import { useEffect, useRef, useState } from "react";
import {
  DispositionField,
  fieldsForTab,
  unassignedFields,
  useVisibleDispositionTabs,
  type FrreField,
  type FrreTab,
} from "@/components/leads/disposition/disposition-field-groups";
import type { RuleDecision } from "@/lib/services/forms/form-rule-evaluator";

interface CleanRuntime {
  versionId: string;
  tabs: FrreTab[];
  fields: FrreField[];
}

const MAIN_TAB_ID = "__call_disposition__";

export function CleanDispositionForm({
  runtime,
  leadStage,
  decision,
  selectedStatus,
  onStatusChange,
  selectedSubStage,
  onSubStageChange,
  notes,
  onNotesChange,
  dateTimeValue,
  onDateTimeChange,
  fieldValues,
  onFieldChange,
  error,
  saving,
  onCancel,
  onSave,
}: {
  runtime: CleanRuntime;
  leadStage: string | null;
  decision: RuleDecision | null;
  selectedStatus: string;
  onStatusChange: (v: string) => void;
  selectedSubStage: string;
  onSubStageChange: (v: string) => void;
  notes: string;
  onNotesChange: (v: string) => void;
  dateTimeValue: string;
  onDateTimeChange: (v: string) => void;
  fieldValues: Record<string, string | string[]>;
  onFieldChange: (fieldKey: string, value: string | string[]) => void;
  error: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: () => void;
}) {
  const [statuses, setStatuses] = useState<string[]>([]);
  const [subByStatus, setSubByStatus] = useState<Record<string, string[]>>({});

  // Canonical stage-filtered statuses (Decision A) + sub-status options.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/forms/disposition-statuses?stage=${encodeURIComponent(leadStage ?? "")}`,
          { credentials: "include" },
        );
        const json = await res.json();
        if (!cancelled && res.ok) setStatuses(Array.isArray(json.data) ? json.data : []);
      } catch {
        if (!cancelled) setStatuses([]);
      }
    })();
    void (async () => {
      try {
        const res = await fetch("/api/settings/workspace", { credentials: "include" });
        const json = await res.json();
        if (!cancelled && res.ok) {
          setSubByStatus(json.leadPipelineConfig?.dependentRules?.statusToSubstatuses ?? {});
        }
      } catch {
        if (!cancelled) setSubByStatus({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadStage]);

  const subOptions = subByStatus[selectedStatus] ?? [];

  // The rule-revealed custom tabs (ordered), plus the always-present main tab.
  const revealedTabs = useVisibleDispositionTabs(runtime.fields, runtime.tabs, decision);
  const unassigned = unassignedFields(runtime.fields, decision);

  const [activeTabId, setActiveTabId] = useState<string>(MAIN_TAB_ID);
  // Track which revealed tabs we've already auto-jumped to, so re-renders don't
  // keep yanking the agent back after they manually navigate. Only a NEWLY
  // revealed tab (one not seen before) triggers an auto-switch.
  const seenTabIds = useRef<Set<string>>(new Set());

  useEffect(() => {
    const currentIds = new Set(revealedTabs.map((t) => t.id));

    // Find a newly-revealed tab (present now, not seen before).
    const newlyRevealed = revealedTabs.find((t) => !seenTabIds.current.has(t.id));
    if (newlyRevealed) {
      setActiveTabId(newlyRevealed.id);
    } else if (activeTabId !== MAIN_TAB_ID && !currentIds.has(activeTabId)) {
      // The active custom tab got hidden (status changed) — fall back to main.
      setActiveTabId(MAIN_TAB_ID);
    }

    seenTabIds.current = currentIds;
  }, [revealedTabs, activeTabId]);

  const activeCustomTab = revealedTabs.find((t) => t.id === activeTabId) ?? null;

  return (
    <div className="mt-3">
      {/* ── Top tab-bar: Call Disposition + revealed tabs ─────────────────── */}
      <div role="tablist" aria-label="Disposition sections" className="flex flex-wrap gap-1 border-b border-crm-border">
        <TabButton
          label="Call Disposition"
          active={activeTabId === MAIN_TAB_ID}
          onClick={() => setActiveTabId(MAIN_TAB_ID)}
        />
        {revealedTabs.map((tab) => (
          <TabButton
            key={tab.id}
            label={tab.name}
            active={activeTabId === tab.id}
            onClick={() => setActiveTabId(tab.id)}
          />
        ))}
      </div>

      {/* ── Tab panel ─────────────────────────────────────────────────────── */}
      {activeTabId === MAIN_TAB_ID ? (
        <div role="tabpanel" className="mt-3 grid gap-3 sm:grid-cols-2">
          {/* Contact Stage — read-only (moved by rules/pipeline, not set here). */}
          <div className="text-sm font-medium text-crm-text">
            Contact Stage
            <div className="mt-1 rounded-md bg-crm-panel px-3 py-2 text-sm text-crm-muted">
              {leadStage || "—"}
            </div>
          </div>

          {/* Status — the single primary selection + rule trigger. */}
          <label className="text-sm font-medium text-crm-text">
            Status <span className="text-red-600">*</span>
            <select
              className="crm-input mt-1"
              value={selectedStatus}
              onChange={(e) => onStatusChange(e.target.value)}
            >
              <option value="">Select status…</option>
              {statuses.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>

          {/* Sub-Stage — sub-statuses valid for the selected status (canonical). */}
          {subOptions.length > 0 && (
            <label className="text-sm font-medium text-crm-text">
              Sub-Stage
              <select
                className="crm-input mt-1"
                value={selectedSubStage}
                onChange={(e) => onSubStageChange(e.target.value)}
              >
                <option value="">Select sub-stage…</option>
                {subOptions.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
          )}

          {/* Activity DateTime — load-bearing for the save (FR-D2). */}
          <label className="text-sm font-medium text-crm-text">
            Activity DateTime
            <input
              type="datetime-local"
              className="crm-input mt-1"
              value={dateTimeValue}
              onChange={(e) => onDateTimeChange(e.target.value)}
            />
          </label>

          {/* Notes — protected field. */}
          <label className="text-sm font-medium text-crm-text sm:col-span-2">
            Notes
            <textarea
              className="crm-input mt-1 min-h-[72px]"
              value={notes}
              onChange={(e) => onNotesChange(e.target.value)}
            />
          </label>

          {/* Unassigned custom fields (not bound to any tab) render on the main tab. */}
          {unassigned.map((f) => (
            <DispositionField key={f.id} field={f} decision={decision} values={fieldValues} onChange={onFieldChange} />
          ))}
        </div>
      ) : activeCustomTab ? (
        <div role="tabpanel" className="mt-3 grid gap-3 sm:grid-cols-2">
          {fieldsForTab(runtime.fields, activeCustomTab.id, decision).map((f) => (
            <DispositionField key={f.id} field={f} decision={decision} values={fieldValues} onChange={onFieldChange} />
          ))}
        </div>
      ) : null}

      {/* ── Footer (always visible, below the tab panel) ──────────────────── */}
      {decision?.setStage && (
        <div className="mt-3 rounded-md bg-crm-blue-soft px-3 py-2 text-xs font-medium text-crm-blue">
          Rule will set Contact Stage → {decision.setStage.status}
        </div>
      )}

      {error && (
        <div className="mt-3 rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700">
          {error}
        </div>
      )}

      <div className="mt-3 flex items-center justify-end gap-2 border-t border-crm-border pt-3">
        <button
          type="button"
          className="rounded px-4 py-1.5 text-sm font-medium text-crm-muted hover:text-crm-text"
          onClick={onCancel}
        >
          Cancel
        </button>
        <button
          type="button"
          className="rounded bg-crm-blue px-4 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? "Saving..." : "Save"}
        </button>
      </div>
    </div>
  );
}

function TabButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={
        "-mb-px rounded-t-md border-b-2 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide transition " +
        (active ? "border-crm-blue text-crm-blue" : "border-transparent text-crm-muted hover:text-crm-text")
      }
    >
      {label}
    </button>
  );
}
