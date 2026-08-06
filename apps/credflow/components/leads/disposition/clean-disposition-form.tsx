"use client";

/**
 * FR-RE Stage 2b — the clean disposition form (rendered when a live FR-RE form
 * exists; otherwise the modal shows the legacy fallback). Pure FR-RE structure,
 * no legacy Section1/3 / demo block / STAGE_STATUS_OPTIONS / disposition picker.
 *
 * ONE primary selection: Status, from the canonical stage-filtered source
 * (getDispositionStatuses via /api/forms/disposition-statuses) — the rule trigger.
 * Plus the 4 protected fields (Contact Stage read-only, Status, Sub-Stage, Notes)
 * and the custom fields + rule-driven tabs via the shared <DispositionFieldGroups>.
 *
 * Stage 3-C: it now owns its own Save button (Option Y), wired to the modal's
 * submitCleanDisposition via onSave (which builds the payload through the shared
 * buildCleanCallLogPayload + hard-required guard). Legacy view keeps its own Save.
 */
import { useEffect, useState } from "react";
import {
  DispositionFieldGroups,
  type FrreField,
  type FrreTab,
} from "@/components/leads/disposition/disposition-field-groups";
import type { RuleDecision } from "@/lib/services/forms/form-rule-evaluator";

interface CleanRuntime {
  versionId: string;
  tabs: FrreTab[];
  fields: FrreField[];
}

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

  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
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

      {/* Custom fields + rule-driven tabs (show_field / show_tab) — shared render. */}
      <DispositionFieldGroups
        fields={runtime.fields}
        tabs={runtime.tabs}
        decision={decision}
        values={fieldValues}
        onChange={onFieldChange}
      />

      {decision?.setStage && (
        <div className="rounded-md bg-crm-blue-soft px-3 py-2 text-xs font-medium text-crm-blue sm:col-span-2">
          Rule will set Contact Stage → {decision.setStage.status}
        </div>
      )}

      {error && (
        <div className="rounded-md bg-red-50 px-3 py-2 text-xs font-medium text-red-700 sm:col-span-2">
          {error}
        </div>
      )}

      <div className="mt-1 flex items-center justify-end gap-2 border-t border-crm-border pt-3 sm:col-span-2">
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
