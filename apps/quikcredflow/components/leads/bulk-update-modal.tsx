"use client";

import { useState, useEffect } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import type { FilterPayload } from "@/types/lead-filter";

/**
 * Bulk Update modal (v1: Lead Tagging).
 *
 * Mirrors the LSQ flow: choose a scope, set the tag value, Save. Three scopes:
 *   - "ids":      the leads the user checkbox-selected on screen.
 *   - "matching": ALL leads matching the current filter (across every page).
 *   - "count":    the first N matching the current filter.
 *
 * v1 writes only the Lead Tagging field (server enforces the allowlist too).
 * The write mode is "replace" for now; swaps to "append" once CredFlow confirms
 * whether re-tagging overwrites or accumulates.
 */

const TAG_FIELD_KEY = "lead_tagging";
const TAG_FIELD_LABEL = "Lead Tagging";
const WRITE_MODE: "replace" | "append" = "replace";

type ScopeKind = "ids" | "matching" | "count";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Current advanced filter (used for "matching"/"count" scopes). */
  filter: FilterPayload;
  /** Ids the user has checkbox-selected. */
  selectedIds: string[];
  /** Total leads matching the current filter (for the "all matching" label). */
  totalMatching: number;
  /** Called after a successful update so the parent can refetch + clear selection. */
  onDone: () => void;
}

export function BulkUpdateModal({
  open,
  onClose,
  filter,
  selectedIds,
  totalMatching,
  onDone,
}: Props) {
  const toast = useToast();
  const [scope, setScope] = useState<ScopeKind>("ids");
  const [customCount, setCustomCount] = useState("");
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      // Default to the most natural scope: if rows are selected, use them;
      // otherwise default to all-matching.
      setScope(selectedIds.length > 0 ? "ids" : "matching");
      setCustomCount("");
      setValue("");
    }
  }, [open, selectedIds.length]);

  async function handleSave() {
    const tag = value.trim();
    if (!tag) {
      toast.error("Enter a tag value.");
      return;
    }

    let scopePayload: Record<string, unknown>;
    if (scope === "ids") {
      if (selectedIds.length === 0) {
        toast.error("No leads selected.");
        return;
      }
      scopePayload = { kind: "ids", ids: selectedIds };
    } else if (scope === "matching") {
      scopePayload = { kind: "matching", filter };
    } else {
      const n = Number(customCount);
      if (!Number.isInteger(n) || n < 1) {
        toast.error("Enter a valid number of leads.");
        return;
      }
      scopePayload = { kind: "count", filter, count: n };
    }

    setSaving(true);
    try {
      const res = await fetch("/api/leads/bulk-update", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scope: scopePayload,
          updates: [{ field: TAG_FIELD_KEY, value: tag, mode: WRITE_MODE }],
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Bulk update failed");
      toast.success(`Tagged ${json.updated} lead${json.updated === 1 ? "" : "s"} as "${tag}".`);
      onDone();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk update failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Bulk Update" width="max-w-lg">
      <div className="space-y-4">
        {/* Scope */}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              checked={scope === "ids"}
              disabled={selectedIds.length === 0}
              onChange={() => setScope("ids")}
            />
            Update selected {selectedIds.length} lead{selectedIds.length === 1 ? "" : "s"}
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              checked={scope === "matching"}
              onChange={() => setScope("matching")}
            />
            Select all {totalMatching} leads matching this filter
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name="scope"
              checked={scope === "count"}
              onChange={() => setScope("count")}
            />
            Select
            <Input
              type="number"
              min={1}
              value={customCount}
              onChange={(e) => setCustomCount(e.target.value)}
              onFocus={() => setScope("count")}
              className="w-24"
              placeholder="e.g. 200"
            />
            leads
          </label>
        </div>

        <hr className="border-crm-border" />

        {/* Field + value */}
        <div className="space-y-2">
          <div className="text-sm font-medium text-crm-text">
            Update <span className="text-crm-blue">{TAG_FIELD_LABEL}</span> to:
          </div>
          <Input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="e.g. aug-upgrade-drive"
            autoFocus
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" type="button" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !value.trim()}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}