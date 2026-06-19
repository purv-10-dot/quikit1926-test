"use client";

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ConditionRowEditor } from "@/components/filters/condition-row";
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

export function AdvancedFilterModal({ open, initial, onClose, onApply, onSave, extraFields = [], dynamicOptions }: Props) {
  const toast = useToast();
  const [matchMode, setMatchMode] = useState<MatchMode>(initial?.matchMode ?? "ALL");
  const [rows, setRows] = useState<ConditionRow[]>(initial?.conditions?.length ? initial.conditions : [makeBlankCondition()]);
  const [saveName, setSaveName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      setMatchMode(initial?.matchMode ?? "ALL");
      setRows(initial?.conditions?.length ? initial.conditions : [makeBlankCondition()]);
      setSaveName("");
      setSaveAsDefault(false);
    }
  }, [open, initial]);

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

  function build(): FilterPayload {
    // Drop incomplete rows (no field, or required value missing)
    const cleaned = rows.filter((r) => {
      const def = resolveLeadFilterField(r.field, extraFields);
      if (!def) return false;
      if (r.operator === "isEmpty" || r.operator === "isNotEmpty" || r.operator === "isTrue" || r.operator === "isFalse") return true;
      if (r.value == null || r.value === "") return false;
      if (Array.isArray(r.value) && r.value.length === 0) return false;
      return true;
    });
    return { matchMode, conditions: cleaned };
  }

  function handleApply() {
    const payload = build();
    const hadInput = rows.some(
      (r) =>
        r.operator === "isEmpty" ||
        r.operator === "isNotEmpty" ||
        r.operator === "isTrue" ||
        r.operator === "isFalse" ||
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

      <div className="space-y-2">
        {rows.map((r, i) => (
          <ConditionRowEditor
            key={i}
            row={r}
            onChange={(next) => updateRow(i, next)}
            onRemove={() => removeRow(i)}
            extraFields={extraFields}
            dynamicOptions={dynamicOptions}
          />
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
