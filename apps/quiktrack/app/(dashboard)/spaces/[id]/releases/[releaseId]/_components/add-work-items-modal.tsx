"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from "@/components/modal";
import { showToast } from "@/lib/ui/toast";

interface IssueOption {
  id: string;
  key: string;
  title: string;
}

export function AddWorkItemsModal({
  open,
  onClose,
  projectId,
  releaseId,
  excludeIds,
  onAdded,
  title = "Add work items",
  singleSelect = false,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  releaseId: string;
  excludeIds: string[];
  onAdded: () => void;
  title?: string;
  /** Restricts selection to a single issue (used by "Link work item", which
   * links exactly one issue into Related Work). */
  singleSelect?: boolean;
  /** Overrides the default "add to this release's Work Items" behavior —
   * used by "Link work item" to instead create a related-work row. */
  onSave?: (issueIds: string[]) => Promise<boolean>;
}) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<IssueOption[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(new Set());
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => {
      const params = new URLSearchParams({
        projectId,
        excludeType: "SUBTASK",
        limit: "30",
      });
      if (query.trim()) params.set("search", query.trim());
      fetch(`/api/issues?${params.toString()}`)
        .then((r) => r.json())
        .then((res) => {
          if (res?.success) {
            const rows = (res.data ?? []) as IssueOption[];
            setOptions(rows.filter((r) => !excludeIds.includes(r.id)));
          }
        })
        .catch(() => undefined);
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, query, projectId]);

  function toggle(id: string) {
    setSelected((prev) => {
      if (singleSelect) return prev.has(id) ? new Set() : new Set([id]);
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save() {
    if (selected.size === 0 || saving) return;
    setSaving(true);
    try {
      const issueIds = Array.from(selected);
      const ok = onSave
        ? await onSave(issueIds)
        : await fetch(`/api/releases/${releaseId}/issues`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ issueIds }),
          })
            .then((r) => r.json())
            .then((res) => {
              if (!res?.success) {
                showToast(res?.error || "Couldn't add work items.", "error");
                return false;
              }
              return true;
            });
      if (!ok) return;
      onAdded();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  // Portalled to document.body directly — this modal is invoked from deep
  // inside the release detail tree (collapsible sections, flex layout), and
  // relying on Modal's own `fixed` centering through arbitrary ancestor
  // markup is fragile (any ancestor with a CSS transform, e.g. from a
  // Framer Motion animation elsewhere, would silently break `fixed`'s
  // containing block). Mounting at the true document root sidesteps that.
  return createPortal(
    <Modal open={open} onOpenChange={(v) => !v && onClose()} className="max-w-lg">
      <ModalContent>
        <ModalHeader onClose={onClose}>
          <ModalTitle>{title}</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search work items…"
            className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-gray-200">
            {options.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-gray-500">No matching work items.</div>
            ) : (
              options.map((o, idx) => (
                <label
                  key={o.id}
                  className={`flex min-h-[40px] cursor-pointer items-center gap-3 px-3 py-2 text-sm hover:bg-blue-50/60 ${
                    idx > 0 ? "border-t border-gray-100" : ""
                  } ${selected.has(o.id) ? "bg-blue-50/60" : ""}`}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(o.id)}
                    onChange={() => toggle(o.id)}
                    className="h-4 w-4 shrink-0 rounded border-gray-300 text-blue-600 focus:ring-2 focus:ring-blue-400"
                  />
                  <span className="shrink-0 text-xs font-medium text-gray-500">{o.key}</span>
                  <span className="truncate text-gray-800">{o.title}</span>
                </label>
              ))
            )}
          </div>
        </ModalBody>
        <ModalFooter>
          <button
            type="button"
            onClick={onClose}
            className="h-9 px-4 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={selected.size === 0 || saving}
            onClick={save}
            className="h-9 px-5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:bg-gray-200 disabled:text-gray-500"
          >
            {saving ? "Adding…" : `Add ${selected.size > 0 ? selected.size : ""}`.trim()}
          </button>
        </ModalFooter>
      </ModalContent>
    </Modal>,
    document.body,
  );
}
