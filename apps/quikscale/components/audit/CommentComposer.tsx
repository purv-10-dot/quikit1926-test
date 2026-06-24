"use client";

import { useState } from "react";
import { MessageSquarePlus } from "lucide-react";
import { useAddAuditComment } from "@/lib/hooks/useAudit";

/**
 * Compact comment composer for the Change History drawer. Posts a free-text
 * comment (stored as a COMMENT AuditEvent) and lets the timeline refetch show
 * it. Gated per-entity via the audit config's `renderComposer`.
 */
export function CommentComposer({
  entityType,
  entityId,
  placeholder = "Add a comment…",
}: {
  entityType: string;
  entityId: string;
  placeholder?: string;
}) {
  const [value, setValue] = useState("");
  const { mutate, isPending } = useAddAuditComment(entityType, entityId);

  function submit() {
    const content = value.trim();
    if (!content || isPending) return;
    mutate(content, { onSuccess: () => setValue("") });
  }

  return (
    <div className="flex items-end gap-2 rounded-lg border border-gray-200 px-3 py-2">
      <MessageSquarePlus className="mt-1 h-4 w-4 shrink-0 text-gray-400" />
      <textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            submit();
          }
        }}
        rows={1}
        placeholder={placeholder}
        aria-label="Add a comment"
        className="max-h-24 w-full resize-y text-sm outline-none placeholder:text-gray-400"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!value.trim() || isPending}
        className="shrink-0 rounded-md bg-gray-900 px-2.5 py-1 text-xs font-semibold text-white hover:bg-gray-700 disabled:cursor-not-allowed disabled:opacity-50"
      >
        {isPending ? "Posting…" : "Comment"}
      </button>
    </div>
  );
}
