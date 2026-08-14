"use client";

import { useState } from "react";
import { FileText, Plus, X } from "lucide-react";
import { showToast } from "@/lib/ui/toast";
import { confirmDialog } from "@/lib/ui/confirm";
import type { ReleaseRelatedLink } from "./release-detail-meta";

export function RelatedWorkSection({
  releaseId,
  links,
  canEdit,
  onChanged,
}: {
  releaseId: string;
  links: ReleaseRelatedLink[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [saving, setSaving] = useState(false);

  async function addLink() {
    const t = title.trim();
    const u = url.trim();
    if (!t || !u || saving) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/releases/${releaseId}/links`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: t, url: u }),
      }).then((r) => r.json());
      if (!res?.success) {
        showToast(res?.error || "Couldn't add the link.", "error");
        return;
      }
      setTitle("");
      setUrl("");
      setAdding(false);
      onChanged();
    } finally {
      setSaving(false);
    }
  }

  async function removeLink(linkId: string) {
    const ok = await confirmDialog({
      title: "Remove related work",
      message: "Remove this link from the release?",
      confirmText: "Remove",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/releases/${releaseId}/links?linkId=${linkId}`, {
      method: "DELETE",
    }).then((r) => r.json());
    if (res?.success) onChanged();
    else showToast(res?.error || "Couldn't remove the link.", "error");
  }

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-900">
          Related work <span className="text-gray-400 font-normal">{links.length}</span>
        </h3>
        {canEdit && !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="p-1 hover:bg-gray-100 rounded text-gray-500"
            aria-label="Add related work"
          >
            <Plus className="h-4 w-4" />
          </button>
        )}
      </div>

      {adding && (
        <div className="px-4 py-3 border-b border-gray-100 space-y-2">
          <input
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Title"
            className="w-full h-8 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://…"
            className="w-full h-8 px-2 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={!title.trim() || !url.trim() || saving}
              onClick={addLink}
              className="h-7 px-2.5 text-xs font-medium text-white bg-blue-600 hover:bg-blue-700 rounded disabled:bg-gray-200 disabled:text-gray-500"
            >
              {saving ? "Adding…" : "Add"}
            </button>
            <button
              type="button"
              onClick={() => {
                setAdding(false);
                setTitle("");
                setUrl("");
              }}
              className="h-7 px-2.5 text-xs text-gray-700 hover:bg-gray-100 rounded"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {links.length === 0 ? (
        <div className="px-4 py-10 text-center">
          <FileText className="mx-auto h-6 w-6 text-gray-300" />
          <div className="mt-2 text-sm font-medium text-gray-700">Start adding some related work</div>
          <div className="text-xs text-gray-400">
            Add the work that&apos;s needed to get ready for your release, like designs, release notes, or dashboards.
          </div>
        </div>
      ) : (
        <div className="divide-y divide-gray-100">
          {links.map((l) => (
            <div key={l.id} className="flex items-center justify-between px-4 py-2.5">
              <a
                href={l.url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-blue-600 hover:underline truncate"
              >
                {l.title}
              </a>
              {canEdit && (
                <button
                  type="button"
                  onClick={() => void removeLink(l.id)}
                  className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-red-600 shrink-0"
                  aria-label="Remove link"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
