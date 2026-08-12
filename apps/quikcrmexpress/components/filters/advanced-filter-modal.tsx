"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConditionRowEditor, RELATIVE_NO_VALUE_OPERATORS, RELATIVE_N_OPERATORS } from "@/components/filters/condition-row";
import type { ConditionRow, FilterFieldDef, FilterPayload, MatchMode } from "@/types/lead-filter";
import { DEFAULT_OPERATORS } from "@/types/lead-filter";
import { LEAD_FILTER_FIELDS, resolveLeadFilterField } from "@/lib/lead-filter-fields";
import { useToast } from "@/hooks/use-toast";

interface Props {
  open: boolean;
  initial?: FilterPayload;
  onClose: () => void;
  onApply: (payload: FilterPayload) => void;
  onSave?: (payload: FilterPayload, name: string, isDefault: boolean) => Promise<void> | void;
  /** Extra (org-defined) fields appended to the standard catalog. */
  extraFields?: FilterFieldDef[];
  /**
   * Runtime option lists keyed by field name. Caller fetches the values
   * (e.g. owner names from /api/users) and passes them in; matching rows
   * render as a select dropdown instead of a free-text input.
   */
  dynamicOptions?: Record<string, { value: string; label: string }[]>;
}

function makeBlankCondition(): ConditionRow {
  const first = LEAD_FILTER_FIELDS[0]!;
  const op = (first.operators ?? DEFAULT_OPERATORS[first.type])[0]!;
  return { field: first.field, operator: op, value: "" };
}

/**
 * Connector shown between two condition rows. It's purely a visual expression
 * of the single Match mode (uniform ALL/ANY) — a centered vertical rail with
 * the join word (AND / OR). It is NOT a control: there are no per-condition
 * joins; the Match radio at the top is the only source of truth. AND renders
 * in brand blue, OR in purple to distinguish the mode at a glance.
 */
function JoinConnector({ mode }: { mode: MatchMode }) {
  const isAnd = mode === "ALL";
  const label = isAnd ? "AND" : "OR";
  const color = isAnd ? "text-crm-blue" : "text-[#7c3aed]";
  return (
    <div className="flex flex-col items-center py-0.5" aria-hidden="true">
      <div className="h-3 w-0.5 bg-crm-border" />
      <span className={`my-0.5 text-[11px] font-bold tracking-[0.08em] ${color}`}>{label}</span>
      <div className="h-3 w-0.5 bg-crm-border" />
    </div>
  );
}

export function AdvancedFilterModal({ open, initial, onClose, onApply, onSave, extraFields = [], dynamicOptions }: Props) {
  const toast = useToast();
  const [matchMode, setMatchMode] = useState<MatchMode>(initial?.matchMode ?? "ALL");
  const [rows, setRows] = useState<ConditionRow[]>(initial?.conditions?.length ? initial.conditions : [makeBlankCondition()]);
  const [saveName, setSaveName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  // Lazily-fetched value lists for CUSTOM fields, keyed by field key. The base
  // `dynamicOptions` (owner/stage/status) come from the parent; custom-field
  // values are fetched from /api/leads/field-values ON DEMAND when a condition
  // targets that field — there are 200+ custom fields, so eager fetch is a
  // non-starter. A field the endpoint resolves to "no picker" is cached as [] so
  // it renders as free-text and is never refetched.
  const [fetchedOptions, setFetchedOptions] = useState<Record<string, { value: string; label: string }[]>>({});
  const inFlight = useRef<Set<string>>(new Set());

  // Reset the editor state ONLY on a closed→open transition, not on every
  // `initial` reference change. The dependency array previously included
  // `initial`, so any parent re-render that produced a new `initial` object
  // reference (filter state churn, persistence rehydration, composed-filter
  // recompute) re-fired this effect WHILE THE MODAL WAS OPEN and reset
  // matchMode/rows back to `initial` — silently reverting the user's ANY
  // selection to ALL before Apply. That was the OR-behaves-like-AND bug: the
  // payload shipped matchMode:"ALL" even though the user picked ANY. Snapshot
  // `initial` into a ref and seed from it only when `open` flips true, so
  // mid-edit parent re-renders can't clobber the in-progress selection.
  const initialRef = useRef(initial);
  initialRef.current = initial;
  const wasOpen = useRef(false);
  useEffect(() => {
    if (open && !wasOpen.current) {
      const seed = initialRef.current;
      setMatchMode(seed?.matchMode ?? "ALL");
      setRows(seed?.conditions?.length ? seed.conditions : [makeBlankCondition()]);
      setSaveName("");
      setSaveAsDefault(false);
    }
    wasOpen.current = open;
  }, [open]);

  // Fetch value lists for any CUSTOM field referenced by a condition row that we
  // don't already have options for. Runs when rows change (a field was picked)
  // or the modal opens. Skips fields the parent already covers via dynamicOptions
  // (owner/stage/status) and standard free-text fields (not in extraFields), so
  // only real custom fields hit the endpoint. Each key is fetched at most once.
  useEffect(() => {
    if (!open) return;
    const base = dynamicOptions ?? {};
    const customKeys = new Set(extraFields.map((f) => f.field));
    const needed = Array.from(new Set(rows.map((r) => r.field))).filter(
      (f) => customKeys.has(f) && !(f in base) && !(f in fetchedOptions) && !inFlight.current.has(f),
    );
    if (needed.length === 0) return;
    for (const field of needed) {
      inFlight.current.add(field);
      fetch(`/api/leads/field-values?field=${encodeURIComponent(field)}`, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : { values: null }))
        .then((json: { values: { value: string; label: string }[] | null }) => {
          setFetchedOptions((prev) => ({ ...prev, [field]: json?.values ?? [] }));
        })
        .catch(() => setFetchedOptions((prev) => ({ ...prev, [field]: [] })))
        .finally(() => inFlight.current.delete(field));
    }
    // fetchedOptions is intentionally omitted from deps: it's updated inside and
    // guarded by the `in fetchedOptions` check, so including it only re-runs
    // harmlessly. Omitting avoids churn on every value keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, rows, extraFields, dynamicOptions]);

  // Parent-supplied options (owner/stage/status) always win over fetched ones.
  const mergedDynamicOptions = useMemo(
    () => ({ ...fetchedOptions, ...(dynamicOptions ?? {}) }),
    [fetchedOptions, dynamicOptions],
  );

  function addRow() {
    setRows((rs) => [...rs, makeBlankCondition()]);
  }
  function updateRow(idx: number, next: ConditionRow) {
    setRows((rs) => rs.map((r, i) => (i === idx ? next : r)));
  }
  function removeRow(idx: number) {
    setRows((rs) => (rs.length === 1 ? rs : rs.filter((_, i) => i !== idx)));
  }
  function clearAll() {
    setRows([makeBlankCondition()]);
    setMatchMode("ALL");
  }

  /**
   * A row is complete (should be applied, not dropped) when:
   *  - its field resolves, AND
   *  - it's a valueless operator (isEmpty/isNotEmpty/isTrue/isFalse), OR
   *  - it's a no-value relative date operator (today/this week/…), OR
   *  - it's a relative "N days" operator with a positive integer N, OR
   *  - it has a non-empty value.
   * Kept as one predicate so build() and handleApply() never diverge.
   */
  function isRowComplete(r: ConditionRow): boolean {
    const def = resolveLeadFilterField(r.field, extraFields);
    if (!def) return false;
    if (r.operator === "isEmpty" || r.operator === "isNotEmpty" || r.operator === "isTrue" || r.operator === "isFalse") {
      return true;
    }
    if (RELATIVE_NO_VALUE_OPERATORS.has(r.operator)) return true;
    if (RELATIVE_N_OPERATORS.has(r.operator)) {
      const n = typeof r.value === "number" ? r.value : Number(r.value);
      return Number.isFinite(n) && n >= 1;
    }
    if (r.value == null || r.value === "") return false;
    if (Array.isArray(r.value) && r.value.length === 0) return false;
    return true;
  }

  function build(): FilterPayload {
    // Drop incomplete rows (no field, or required value missing)
    const cleaned = rows.filter(isRowComplete);
    return { matchMode, conditions: cleaned };
  }

  function handleApply() {
    const payload = build();
    // "Had input" = the user touched a row in a way that should have produced a
    // condition. If they did but nothing survived cleaning, the row is malformed
    // (e.g. relative-N with no N) — warn instead of silently applying nothing.
    const hadInput = rows.some(
      (r) =>
        r.operator === "isEmpty" ||
        r.operator === "isNotEmpty" ||
        r.operator === "isTrue" ||
        r.operator === "isFalse" ||
        RELATIVE_NO_VALUE_OPERATORS.has(r.operator) ||
        RELATIVE_N_OPERATORS.has(r.operator) ||
        (r.value != null && r.value !== "" && !(Array.isArray(r.value) && r.value.length === 0)),
    );
    if (hadInput && payload.conditions.length === 0) {
      toast.error("Complete each condition (field, operator, and value) before applying.");
      return;
    }
    onApply(payload);
    onClose();
  }

  async function handleSave() {
    if (!onSave || !saveName.trim()) return;
    setSaving(true);
    try {
      await onSave(build(), saveName.trim(), saveAsDefault);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Advanced filter" width="max-w-3xl">
      <div className="mb-3 flex items-center gap-3 text-sm">
        <span className="text-crm-muted">Match</span>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="match"
            value="ALL"
            checked={matchMode === "ALL"}
            onChange={() => setMatchMode("ALL")}
          />
          ALL conditions (AND)
        </label>
        <label className="flex items-center gap-1">
          <input
            type="radio"
            name="match"
            value="ANY"
            checked={matchMode === "ANY"}
            onChange={() => setMatchMode("ANY")}
          />
          ANY condition (OR)
        </label>
      </div>

      <div>
        {rows.map((r, i) => (
          <div key={i}>
            {i > 0 && <JoinConnector mode={matchMode} />}
            <ConditionRowEditor
              row={r}
              onChange={(next) => updateRow(i, next)}
              onRemove={() => removeRow(i)}
              extraFields={extraFields}
              dynamicOptions={mergedDynamicOptions}
            />
          </div>
        ))}
      </div>

      <div className="mt-3 flex items-center gap-2">
        <Button variant="ghost" type="button" onClick={addRow}>
          <Plus size={14} /> Add condition
        </Button>
        <button type="button" onClick={clearAll} className="ml-2 text-xs text-crm-muted hover:text-crm-text">
          Clear all
        </button>
      </div>

      {onSave && (
        <div className="mt-5 rounded-lg border border-crm-border bg-crm-panel p-3">
          <div className="mb-2 text-sm font-medium text-crm-text">Save as a view</div>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              placeholder="View name (e.g. My priority leads)"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="max-w-xs"
            />
            <label className="flex items-center gap-1 text-sm text-crm-text">
              <input type="checkbox" checked={saveAsDefault} onChange={(e) => setSaveAsDefault(e.target.checked)} />
              Default
            </label>
            <Button variant="secondary" type="button" onClick={handleSave} disabled={!saveName.trim() || saving}>
              {saving ? "Saving…" : "Save view"}
            </Button>
          </div>
        </div>
      )}

      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button type="button" onClick={handleApply}>
          Apply
        </Button>
      </div>
    </Modal>
  );
}
