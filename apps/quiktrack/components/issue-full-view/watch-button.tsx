"use client";

import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useApiData } from "@/lib/hooks/useApiData";

interface WatchData {
  count: number;
  isWatching: boolean;
}

/**
 * Eye-icon watch toggle for the issue header, mirroring Jira's "Watch
 * options" button. Toggling adds/removes the caller from QtIssueWatcher,
 * which drives the "Watching" tab in the notification panel.
 */
export function WatchButton({ issueId }: { issueId: string }) {
  const queryClient = useQueryClient();
  const queryKey = ["quiktrack", "issue-watchers", issueId] as const;
  const { data, isLoading } = useApiData<WatchData>(queryKey, `/api/issues/${issueId}/watch`);
  const [pending, setPending] = useState(false);

  async function toggle() {
    if (pending || isLoading) return;
    setPending(true);
    try {
      const res = await fetch(`/api/issues/${issueId}/watch`, {
        method: data?.isWatching ? "DELETE" : "POST",
      }).then((r) => r.json());
      if (res?.success) {
        queryClient.setQueryData<WatchData>(queryKey, res.data);
      }
    } finally {
      setPending(false);
    }
  }

  const isWatching = data?.isWatching ?? false;
  const count = data?.count ?? 0;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      title={isWatching ? "Stop watching this work item" : "Watch this work item"}
      aria-pressed={isWatching}
      aria-label={isWatching ? "Stop watching" : "Watch"}
      className={`inline-flex items-center gap-1 h-7 px-2 rounded border text-xs font-medium transition-colors ${
        isWatching
          ? "border-accent-300 bg-accent-50 text-accent-700 hover:bg-accent-100"
          : "border-gray-200 text-gray-600 hover:bg-gray-100"
      }`}
    >
      {isWatching ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
      {count > 0 && <span>{count}</span>}
    </button>
  );
}
