"use client";

import { useState } from "react";
import { Tag } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import {
  ACCOUNT_LABEL_PRESETS,
  normalizeAccountTags,
  tagBadgeClass,
} from "@/lib/accounts/account-labels";

interface Props {
  accountId: string;
  tags: string[];
  canEdit: boolean;
  onUpdated: (tags: string[]) => void;
}

export function AccountTagsEditor({ accountId, tags, canEdit, onUpdated }: Props) {
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const normalized = normalizeAccountTags(tags);

  async function toggle(label: string) {
    if (!canEdit || busy) return;
    const next = normalized.includes(label)
      ? normalized.filter((t) => t !== label)
      : [...normalized, label];
    setBusy(true);
    try {
      const res = await fetch(`/api/accounts/${accountId}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tags: next }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Failed to update labels");
      onUpdated(normalizeAccountTags(j.tags ?? next));
      toast.success("Labels updated");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to update labels");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3">
      <p className="mb-1.5 flex items-center gap-1 text-xs font-medium text-crm-muted">
        <Tag size={12} /> Labels
      </p>
      <div className="flex flex-wrap gap-1.5">
        {ACCOUNT_LABEL_PRESETS.map((label) => {
          const on = normalized.includes(label);
          return (
            <button
              key={label}
              type="button"
              disabled={!canEdit || busy}
              onClick={() => void toggle(label)}
              className={
                "rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 transition disabled:opacity-50 " +
                (on
                  ? tagBadgeClass(label)
                  : "bg-white text-crm-muted ring-crm-border hover:bg-crm-panel")
              }
            >
              {label}
            </button>
          );
        })}
      </div>
      {normalized.filter((t) => !ACCOUNT_LABEL_PRESETS.includes(t as never)).length > 0 ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {normalized
            .filter((t) => !ACCOUNT_LABEL_PRESETS.includes(t as never))
            .map((t) => (
              <span
                key={t}
                className={`rounded-full px-2 py-0.5 text-xs ring-1 ${tagBadgeClass(t)}`}
              >
                {t}
              </span>
            ))}
        </div>
      ) : null}
    </div>
  );
}
