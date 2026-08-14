"use client";

import { useEffect, useState } from "react";
import { Modal, ModalContent, ModalHeader, ModalTitle, ModalBody, ModalFooter } from "@quikit/ui";
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
}: {
  open: boolean;
  onClose: () => void;
  projectId: string;
  releaseId: string;
  excludeIds: string[];
  onAdded: () => void;
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
      const res = await fetch(`/api/releases/${releaseId}/issues`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ issueIds: Array.from(selected) }),
      }).then((r) => r.json());
      if (!res?.success) {
        showToast(res?.error || "Couldn't add work items.", "error");
        return;
      }
      onAdded();
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal open={open} onOpenChange={(v) => !v && onClose()} className="max-w-lg">
      <ModalContent>
        <ModalHeader onClose={onClose}>
          <ModalTitle>Add work items</ModalTitle>
        </ModalHeader>
        <ModalBody>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search work items…"
            className="w-full h-9 px-3 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="max-h-72 overflow-y-auto border border-gray-200 rounded-md divide-y divide-gray-100">
            {options.length === 0 ? (
              <div className="px-3 py-6 text-center text-sm text-gray-500">No matching work items.</div>
            ) : (
              options.map((o) => (
                <label
                  key={o.id}
                  className="flex items-center gap-2.5 px-3 py-2 text-sm hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selected.has(o.id)}
                    onChange={() => toggle(o.id)}
                    className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-400"
                  />
                  <span className="text-gray-500 shrink-0">{o.key}</span>
                  <span className="text-gray-800 truncate">{o.title}</span>
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
    </Modal>
  );
}
