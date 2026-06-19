"use client";

import { useEffect, useState } from "react";
import { CheckCircle2, X } from "lucide-react";

interface ToastIssue {
  id: string;
  key: string;
}

/**
 * Global "You've created <KEY>" toast.
 *
 * Listens for `quiktrack:issue-created` events on the window and renders a
 * fixed bottom-left toast with View / Copy link actions. Mount once in the
 * dashboard layout — every create flow (board column, backlog, modal) just
 * needs to `dispatchEvent(new CustomEvent("quiktrack:issue-created", { detail: { id, key } }))`
 * to surface it.
 *
 * Auto-dismisses after 5 seconds.
 */
export function IssueCreatedToast() {
  const [issue, setIssue] = useState<ToastIssue | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    function onCreated(e: Event) {
      const detail = (e as CustomEvent).detail as Partial<ToastIssue> | undefined;
      if (!detail?.id || !detail.key) return;
      setIssue({ id: detail.id, key: detail.key });
      setCopied(false);
    }
    window.addEventListener("quiktrack:issue-created", onCreated);
    return () => window.removeEventListener("quiktrack:issue-created", onCreated);
  }, []);

  useEffect(() => {
    if (!issue) return;
    const t = setTimeout(() => setIssue(null), 5000);
    return () => clearTimeout(t);
  }, [issue]);

  if (!issue) return null;

  function copyLink() {
    if (!issue) return;
    const url = `${window.location.origin}${window.location.pathname}?issueId=${encodeURIComponent(issue.id)}`;
    void navigator.clipboard?.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  function openIssue() {
    if (!issue) return;
    // Best-effort cross-view open: dispatch an "open issue" event that any
    // mounted view can listen for to pop its modal. Falls back to nothing.
    window.dispatchEvent(
      new CustomEvent("quiktrack:open-issue", { detail: { id: issue.id } }),
    );
  }

  return (
    <div className="fixed bottom-4 left-4 z-[100] w-[300px] bg-white border border-gray-200 rounded-md shadow-lg p-3 text-xs">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <span className="font-semibold text-gray-900">
              You&apos;ve created &ldquo;{issue.key}&rdquo; work item
            </span>
            <button
              type="button"
              onClick={() => setIssue(null)}
              className="text-gray-400 hover:text-gray-600"
              aria-label="Dismiss"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={openIssue}
              className="text-blue-600 hover:underline"
            >
              View
            </button>
            <span className="text-gray-300">·</span>
            <button
              type="button"
              onClick={copyLink}
              className="text-blue-600 hover:underline"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
