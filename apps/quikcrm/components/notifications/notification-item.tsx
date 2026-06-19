"use client";

import { useRouter } from "next/navigation";
import {
  BadgeCheck,
  Building2,
  Check,
  CheckCircle2,
  FileText,
  Send,
  TrendingDown,
  TrendingUp,
  Trophy,
  UserCheck,
  UserPlus,
  XCircle,
} from "lucide-react";
import type { NotificationRow } from "@/lib/notifications/types";

// ─── Per-type visual config ───────────────────────────────────────────────────

interface TypeConfig {
  Icon: React.ElementType;
  avatarBg: string;
  avatarFg: string;
  accentBar: string;
  pillBg: string;
  pillFg: string;
  dot: string;
  label: string;
}

const TYPE_CONFIG: Record<string, TypeConfig> = {
  // ── Lead ──────────────────────────────────────────────────────────────────
  lead_assigned: {
    Icon: UserPlus,
    avatarBg: "bg-blue-100",
    avatarFg: "text-blue-600",
    accentBar: "bg-blue-500",
    pillBg: "bg-blue-50",
    pillFg: "text-blue-700",
    dot: "bg-blue-500",
    label: "Lead Assigned",
  },
  lead_stage_changed: {
    Icon: TrendingUp,
    avatarBg: "bg-violet-100",
    avatarFg: "text-violet-600",
    accentBar: "bg-violet-500",
    pillBg: "bg-violet-50",
    pillFg: "text-violet-700",
    dot: "bg-violet-500",
    label: "Stage Changed",
  },
  lead_converted: {
    Icon: CheckCircle2,
    avatarBg: "bg-emerald-100",
    avatarFg: "text-emerald-600",
    accentBar: "bg-emerald-500",
    pillBg: "bg-emerald-50",
    pillFg: "text-emerald-700",
    dot: "bg-emerald-500",
    label: "Converted",
  },
  lead_reassigned: {
    Icon: UserCheck,
    avatarBg: "bg-amber-100",
    avatarFg: "text-amber-600",
    accentBar: "bg-amber-500",
    pillBg: "bg-amber-50",
    pillFg: "text-amber-700",
    dot: "bg-amber-500",
    label: "Reassigned",
  },

  // ── Task ──────────────────────────────────────────────────────────────────
  task_assigned: {
    Icon: UserPlus,
    avatarBg: "bg-blue-100",
    avatarFg: "text-blue-600",
    accentBar: "bg-blue-500",
    pillBg: "bg-blue-50",
    pillFg: "text-blue-700",
    dot: "bg-blue-500",
    label: "Task Assigned",
  },
  task_completed: {
    Icon: CheckCircle2,
    avatarBg: "bg-emerald-100",
    avatarFg: "text-emerald-600",
    accentBar: "bg-emerald-500",
    pillBg: "bg-emerald-50",
    pillFg: "text-emerald-700",
    dot: "bg-emerald-500",
    label: "Task Completed",
  },
  task_due_today: {
    Icon: TrendingUp,
    avatarBg: "bg-orange-100",
    avatarFg: "text-orange-600",
    accentBar: "bg-orange-500",
    pillBg: "bg-orange-50",
    pillFg: "text-orange-700",
    dot: "bg-orange-500",
    label: "Due Today",
  },
  task_due_tomorrow: {
    Icon: TrendingUp,
    avatarBg: "bg-amber-100",
    avatarFg: "text-amber-600",
    accentBar: "bg-amber-400",
    pillBg: "bg-amber-50",
    pillFg: "text-amber-700",
    dot: "bg-amber-400",
    label: "Due Tomorrow",
  },
  task_overdue: {
    Icon: XCircle,
    avatarBg: "bg-red-100",
    avatarFg: "text-red-600",
    accentBar: "bg-red-500",
    pillBg: "bg-red-50",
    pillFg: "text-red-700",
    dot: "bg-red-500",
    label: "Overdue",
  },

  // ── Opportunity ────────────────────────────────────────────────────────────
  opportunity_created: {
    Icon: Building2,
    avatarBg: "bg-blue-100",
    avatarFg: "text-blue-600",
    accentBar: "bg-blue-500",
    pillBg: "bg-blue-50",
    pillFg: "text-blue-700",
    dot: "bg-blue-500",
    label: "Opportunity",
  },
  opportunity_stage_changed: {
    Icon: TrendingUp,
    avatarBg: "bg-violet-100",
    avatarFg: "text-violet-600",
    accentBar: "bg-violet-500",
    pillBg: "bg-violet-50",
    pillFg: "text-violet-700",
    dot: "bg-violet-500",
    label: "Stage Changed",
  },
  opportunity_won: {
    // 🎉 Gold celebration — special styling for the Won event.
    Icon: Trophy,
    avatarBg: "bg-yellow-100",
    avatarFg: "text-yellow-600",
    accentBar: "bg-yellow-500",
    pillBg: "bg-yellow-50",
    pillFg: "text-yellow-700",
    dot: "bg-yellow-500",
    label: "🎉 Won!",
  },
  opportunity_lost: {
    Icon: TrendingDown,
    avatarBg: "bg-red-100",
    avatarFg: "text-red-500",
    accentBar: "bg-red-400",
    pillBg: "bg-red-50",
    pillFg: "text-red-600",
    dot: "bg-red-400",
    label: "Lost",
  },

  // ── Quote ─────────────────────────────────────────────────────────────────
  quote_created: {
    Icon: FileText,
    avatarBg: "bg-slate-100",
    avatarFg: "text-slate-600",
    accentBar: "bg-slate-400",
    pillBg: "bg-slate-50",
    pillFg: "text-slate-600",
    dot: "bg-slate-400",
    label: "Quote",
  },
  quote_sent: {
    Icon: Send,
    avatarBg: "bg-blue-100",
    avatarFg: "text-blue-600",
    accentBar: "bg-blue-500",
    pillBg: "bg-blue-50",
    pillFg: "text-blue-700",
    dot: "bg-blue-500",
    label: "Quote Sent",
  },
  quote_approved: {
    Icon: BadgeCheck,
    avatarBg: "bg-emerald-100",
    avatarFg: "text-emerald-600",
    accentBar: "bg-emerald-500",
    pillBg: "bg-emerald-50",
    pillFg: "text-emerald-700",
    dot: "bg-emerald-500",
    label: "Approved ✓",
  },
  quote_rejected: {
    Icon: XCircle,
    avatarBg: "bg-red-100",
    avatarFg: "text-red-600",
    accentBar: "bg-red-500",
    pillBg: "bg-red-50",
    pillFg: "text-red-700",
    dot: "bg-red-500",
    label: "Rejected",
  },

  // ── Rule-triggered (generic) ───────────────────────────────────────────────
  rule_lead_event: {
    Icon: TrendingUp,
    avatarBg: "bg-violet-100",
    avatarFg: "text-violet-600",
    accentBar: "bg-violet-500",
    pillBg: "bg-violet-50",
    pillFg: "text-violet-700",
    dot: "bg-violet-500",
    label: "Rule",
  },
};

const DEFAULT_CONFIG: TypeConfig = {
  Icon: TrendingUp,
  avatarBg: "bg-slate-100",
  avatarFg: "text-slate-500",
  accentBar: "bg-slate-400",
  pillBg: "bg-slate-50",
  pillFg: "text-slate-600",
  dot: "bg-slate-400",
  label: "Notification",
};

// ─── Relative timestamp ───────────────────────────────────────────────────────

function relativeTime(dateValue: Date | string): string {
  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d ago`;
  return new Date(date).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

// ─── Component ────────────────────────────────────────────────────────────────

interface Props {
  notification: NotificationRow;
  isLast: boolean;
  onMarkRead: (id: string) => void;
  onClose: () => void;
}

export function NotificationItem({
  notification,
  isLast,
  onMarkRead,
  onClose,
}: Props) {
  const router = useRouter();
  const isUnread = !notification.readAt;
  const meta = notification.metadata as Record<string, unknown> | null;
  const type = (meta?.type as string | undefined) ?? "";
  const config = TYPE_CONFIG[type] ?? DEFAULT_CONFIG;
  const { Icon, avatarBg, avatarFg, accentBar, pillBg, pillFg, label } = config;
  const isWon = type === "opportunity_won";

  const handleClick = () => {
    if (isUnread) onMarkRead(notification.id);
    if (notification.link) {
      onClose();
      router.push(notification.link);
    }
  };

  const handleMarkReadClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    onMarkRead(notification.id);
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && handleClick()}
      className={[
        "group relative cursor-pointer select-none outline-none",
        "transition-colors duration-100",
        !isLast && "border-b border-slate-100",
        isWon
          ? "bg-yellow-50/60 hover:bg-yellow-50"
          : isUnread
          ? "bg-blue-50/25 hover:bg-blue-50/50"
          : "bg-white hover:bg-slate-50",
      ].join(" ")}
    >
      {/* Accent bar — always visible for Won; unread-only for others */}
      {(isUnread || isWon) && (
        <span
          aria-hidden
          className={`absolute inset-y-0 left-0 w-[3px] rounded-r-full ${accentBar}`}
        />
      )}

      <div className="flex items-start gap-3 py-3.5 pl-5 pr-4">
        {/* ── Avatar icon ── */}
        <div
          className={[
            "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center",
            "rounded-full shadow-sm",
            avatarBg,
          ].join(" ")}
        >
          <Icon size={16} className={avatarFg} strokeWidth={2.25} />
        </div>

        {/* ── Text content ── */}
        <div className="min-w-0 flex-1">
          {/* Title row */}
          <div className="flex items-start justify-between gap-2">
            <p
              className={[
                "text-[13px] leading-snug",
                isUnread
                  ? "font-semibold text-slate-900"
                  : "font-medium text-slate-600",
              ].join(" ")}
            >
              {notification.title}
            </p>
            {/* Timestamp */}
            <span className="mt-px shrink-0 text-[11px] tabular-nums text-slate-400">
              {relativeTime(notification.createdAt)}
            </span>
          </div>

          {/* Body */}
          {notification.body && (
            <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-slate-500">
              {notification.body}
            </p>
          )}

          {/* Bottom row: type pill + mark-read button */}
          <div className="mt-2 flex items-center justify-between">
            <span
              className={[
                "inline-flex items-center gap-1 rounded-full px-2 py-0.5",
                "text-[10px] font-semibold tracking-wide",
                pillBg,
                pillFg,
              ].join(" ")}
            >
              <span
                className={`h-1 w-1 rounded-full ${config.dot} opacity-80`}
              />
              {label}
            </span>

            {/* Mark as read — appears on hover for unread items */}
            {isUnread && (
              <button
                type="button"
                onClick={handleMarkReadClick}
                className={[
                  "flex items-center gap-1 rounded-md px-2 py-1",
                  "text-[11px] font-medium text-slate-400",
                  "transition-all duration-100",
                  "opacity-0 group-hover:opacity-100",
                  "hover:bg-slate-200 hover:text-slate-700",
                ].join(" ")}
                aria-label="Mark as read"
              >
                <Check size={11} strokeWidth={2.5} />
                Mark read
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
