"use client";

import Link from "next/link";
import { ListChecks, Mail, UserPlus } from "lucide-react";
import { ITEM_LABEL, summarise, type NotificationRow } from "./notifications-meta";

/** Shared notification row, used by both the bell popover and the full /notifications page. */
export function NotificationItem({
  item,
  onOpen,
  closePopover,
}: {
  item: NotificationRow;
  onOpen: () => void;
  closePopover?: () => void;
}) {
  const a = item.actor;
  const initials = a
    ? `${(a.firstName?.[0] || a.email?.[0] || "?").toUpperCase()}${(a.lastName?.[0] || "").toUpperCase()}`
    : "?";
  const actorName = a ? `${a.firstName ?? ""} ${a.lastName ?? ""}`.trim() || a.email : "Someone";
  const summary = summarise(item);
  const onClick = () => {
    onOpen();
    closePopover?.();
  };

  // Personal checklist reminder — no actor/issue, so render its own clean row
  // (icon + "Checklist reminder" + the due-item snippet) instead of the
  // issue-shaped "[actor] updated [KEY]" layout.
  if (item.type === "checklist_due") {
    return (
      <Link
        href="/dashboard"
        onClick={onClick}
        className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
          item.isRead ? "" : "bg-accent-50/40"
        }`}
      >
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-600">
          <ListChecks className="h-4 w-4" />
          {!item.isRead && (
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-gray-900">Checklist reminder</div>
          {summary && <div className="text-sm text-gray-700 line-clamp-2 mt-0.5">{summary}</div>}
          <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
            {relTime(item.createdAt)}
            {item.emailSent && <EmailedBadge />}
          </div>
        </div>
      </Link>
    );
  }

  // Project invite — no issue to link to, so render standalone like the
  // checklist reminder instead of the "[actor] updated [KEY]" layout.
  if (item.type === "PROJECT_INVITE") {
    return (
      <Link
        href="/notifications"
        onClick={onClick}
        className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
          item.isRead ? "" : "bg-accent-50/40"
        }`}
      >
        <div className="relative flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent-100 text-accent-700">
          <UserPlus className="h-4 w-4" />
          {!item.isRead && (
            <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium text-gray-900">Project invite</div>
          {summary && <div className="text-sm text-gray-700 line-clamp-2 mt-0.5">{summary}</div>}
          <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
            {relTime(item.createdAt)}
            {item.emailSent && <EmailedBadge />}
          </div>
        </div>
      </Link>
    );
  }

  const issueHref = item.projectId
    ? `/spaces/${item.projectId}/board${item.issueId ? `?openIssue=${encodeURIComponent(item.issueId)}` : ""}`
    : "/notifications";
  return (
    <Link
      href={issueHref}
      onClick={onClick}
      className={`flex items-start gap-3 px-4 py-3 border-b border-gray-100 hover:bg-gray-50 transition-colors ${
        item.isRead ? "" : "bg-accent-50/40"
      }`}
    >
      <div className="relative h-8 w-8 shrink-0 rounded-full bg-accent-600 text-white text-xs font-semibold flex items-center justify-center">
        {initials}
        {!item.isRead && (
          <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-blue-500 ring-2 ring-white" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="text-xs text-gray-500">
          <span className="font-medium text-gray-900">{actorName}</span> {ITEM_LABEL[item.type] ?? "updated"}{" "}
          {item.issueKey && <span className="font-medium text-accent-700">{item.issueKey}</span>}
        </div>
        {summary && <div className="text-sm text-gray-700 line-clamp-2 mt-0.5">{summary}</div>}
        <div className="text-[11px] text-gray-400 mt-1 flex items-center gap-1">
          {relTime(item.createdAt)}
          {item.emailSent && <EmailedBadge />}
        </div>
      </div>
    </Link>
  );
}

/** Small "also emailed" indicator shown next to the timestamp on notified rows. */
function EmailedBadge() {
  return (
    <span
      className="inline-flex items-center gap-0.5 text-gray-400"
      title="An email was also sent for this notification"
    >
      <span aria-hidden="true">·</span>
      <Mail className="h-3 w-3" />
    </span>
  );
}

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const m = Math.floor(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}
