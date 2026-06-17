"use client";

import { useEffect, useState } from "react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import type { LeadFieldDefinition } from "@/types/field-definition";

interface Props {
  open: boolean;
  onClose: () => void;
  /** All fields (standard + custom). */
  available: LeadFieldDefinition[];
  /** Currently visible column keys. */
  visibleKeys: string[];
  onApply: (keys: string[]) => void;
}

export function ColumnPickerModal({ open, onClose, available, visibleKeys, onApply }: Props) {
  const [draft, setDraft] = useState<string[]>(visibleKeys);
  useEffect(() => {
    if (open) setDraft(visibleKeys);
  }, [open, visibleKeys]);

  function toggle(key: string) {
    setDraft((d) => (d.includes(key) ? d.filter((k) => k !== key) : [...d, key]));
  }
  function moveUp(idx: number) {
    if (idx === 0) return;
    setDraft((d) => {
      const c = [...d];
      [c[idx - 1], c[idx]] = [c[idx]!, c[idx - 1]!];
      return c;
    });
  }
  function moveDown(idx: number) {
    if (idx >= draft.length - 1) return;
    setDraft((d) => {
      const c = [...d];
      [c[idx], c[idx + 1]] = [c[idx + 1]!, c[idx]!];
      return c;
    });
  }

  const labelByKey = new Map(available.map((f) => [f.key, f.label]));
  const selected = draft.filter((k) => labelByKey.has(k));
  const unselected = available.filter((f) => !draft.includes(f.key));

  return (
    <Modal open={open} onClose={onClose} title="Column picker" width="max-w-2xl">
      <p className="mb-3 text-sm text-crm-muted">
        Choose which columns appear in the leads list. Use the arrows to reorder.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-crm-border">
          <div className="border-b border-crm-border bg-crm-panel px-3 py-2 text-xs font-semibold uppercase tracking-wider text-crm-muted">
            Visible ({selected.length})
          </div>
          <ul className="max-h-80 overflow-auto">
            {selected.length === 0 && (
              <li className="px-3 py-3 text-xs text-crm-muted">No columns selected.</li>
            )}
            {selected.map((k, i) => (
              <li key={k} className="flex items-center justify-between border-b border-crm-border px-3 py-1.5 text-sm last:border-0">
                <span className="truncate">{labelByKey.get(k) ?? k}</span>
                <span className="flex items-center gap-1 text-xs">
                  <button onClick={() => moveUp(i)} className="rounded p-1 hover:bg-crm-panel" disabled={i === 0}>
                    ↑
                  </button>
                  <button onClick={() => moveDown(i)} className="rounded p-1 hover:bg-crm-panel" disabled={i === selected.length - 1}>
                    ↓
                  </button>
                  <button onClick={() => toggle(k)} className="rounded p-1 text-red-600 hover:bg-red-50">
                    ✕
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-lg border border-crm-border">
          <div className="border-b border-crm-border bg-crm-panel px-3 py-2 text-xs font-semibold uppercase tracking-wider text-crm-muted">
            Available ({unselected.length})
          </div>
          <ul className="max-h-80 overflow-auto">
            {unselected.length === 0 && (
              <li className="px-3 py-3 text-xs text-crm-muted">All fields are visible.</li>
            )}
            {unselected.map((f) => (
              <li key={f.key} className="border-b border-crm-border px-3 py-1.5 text-sm last:border-0">
                <button onClick={() => toggle(f.key)} className="w-full text-left hover:text-crm-blue">
                  + {f.label} <span className="text-xs text-crm-muted">({f.fieldType})</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-5 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={() => { onApply(draft); onClose(); }}>
          Apply
        </Button>
      </div>
    </Modal>
  );
}
