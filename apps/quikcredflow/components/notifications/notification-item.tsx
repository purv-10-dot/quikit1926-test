"use client";

import { useRouter } from "next/navigation";
import { AlertTriangle, Bell, Check, Clock } from "lucide-react";
import type { NotificationRow } from "@/lib/notifications/types";

// ─── Relative timestamp ───────────────────────────────────────────────────────
// Tight, suffix-less output: "2m" / "1h" / "3d" / "Yesterday" / short date.

function relativeTime(dateValue: Date | string): string {
  const date = typeof dateValue === "string" ? new Date(dateValue) : dateValue;
  const diffMs = Date.now() - date.getTime();
  const diffMin = Math.floor(diffMs / 60_000);
  if (diffMin < 1) return "now";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;

  // Compare against the start of today / yesterday in local time.
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  if (date.getTime() >= startOfToday.getTime() - 86_400_000) return "Yesterday";

  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `${diffD}d`;
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ─── Metadata → render mapping ────────────────────────────────────────────────

type AvatarIcon = "clock-warning" | "alert-error" | "neutral" | null;

interface Described {
  actorName: string | null;
  action: string;
  target: string | null;
  secondary: string | null;
  /** Which semantic icon to show when there is no human actor. */
  icon: AvatarIcon;
}

/** Read a metadata field only when it is a non-empty string. */
function str(meta: Record<string, unknown> | null, key: string): string | null {
  const v = meta?.[key];
  return typeof v === "string" && v.trim().length > 0 ? v : null;
}

/** Compose the optional supporting line for task events. */
function taskSecondary(meta: Record<string, unknown> | null): string | null {
  const due = str(meta, "dueDate") ?? str(meta, "dueAt");
  const priority = str(meta, "priority");
  const parts: string[] = [];
  if (priority) parts.push(`${priority} priority`);
  if (due) {
    const d = new Date(due);
    const label = Number.isNaN(d.getTime())
      ? due
      : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    parts.push(`Due ${label}`);
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

/**
 * Pure helper: turn a notification into an actor/action/target/secondary
 * render model. Reads `metadata.type` defensively and falls back to the
 * notification's own title/body when the type is unknown or fields are absent.
 */
function describe(notification: NotificationRow): Described {
  const meta = notification.metadata;
  const type = str(meta, "type") ?? "";

  // The structured primary line (actor + action + target) already restates the
  // notification body for known types, so a secondary line is only added when
  // it carries NEW information (due/priority, stage transition, new owner).
  switch (type) {
    case "task_assigned": {
      const reassigned = meta?.isReassignment === true;
      return {
        actorName: str(meta, "assignedByName"),
        action: reassigned ? "reassigned a task to you" : "assigned you a task",
        target: str(meta, "taskSubject"),
        secondary: taskSecondary(meta),
        icon: null,
      };
    }
    case "task_completed":
      return {
        actorName: str(meta, "completedByName"),
        action: "completed your task",
        target: str(meta, "taskSubject"),
        secondary: null,
        icon: null,
      };
    case "task_due_today":
      return {
        actorName: null,
        action: "Task due today",
        target: str(meta, "taskSubject"),
        secondary: taskSecondary(meta),
        icon: "clock-warning",
      };
    case "task_due_tomorrow":
      return {
        actorName: null,
        action: "Task due tomorrow",
        target: str(meta, "taskSubject"),
        secondary: taskSecondary(meta),
        icon: "clock-warning",
      };
    case "task_overdue":
      return {
        actorName: null,
        action: "Task overdue",
        target: str(meta, "taskSubject"),
        secondary: taskSecondary(meta),
        icon: "alert-error",
      };
    case "lead_assigned":
      return {
        actorName: str(meta, "assignedByName"),
        action: "assigned you a lead",
        target: str(meta, "leadName"),
        secondary: null,
        icon: null,
      };
    case "lead_reassigned": {
      const newOwner = str(meta, "newOwnerName");
      return {
        actorName: str(meta, "assignedByName"),
        action: "reassigned a lead",
        target: str(meta, "leadName"),
        secondary: newOwner ? `Now owned by ${newOwner}` : null,
        icon: null,
      };
    }
    case "lead_stage_changed": {
      const from = str(meta, "fromStage");
      const to = str(meta, "toStage");
      return {
        actorName: str(meta, "actorName"),
        action: "moved a lead",
        target: str(meta, "leadName"),
        secondary: from && to ? `${from} → ${to}` : null,
        icon: null,
      };
    }
    case "lead_converted":
      return {
        actorName: str(meta, "convertedByName"),
        action: "converted a lead",
        target: str(meta, "leadName"),
        secondary: null,
        icon: null,
      };
    // opportunity_* / quote_* / rule_* / unknown — fall back to title + body.
    default:
      return {
        actorName: null,
        action: notification.title,
        target: null,
        secondary: notification.body,
        icon: "neutral",
      };
  }
}

/** First letters of the first two words of a name, uppercased. */
function initials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join("");
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

function Avatar({
  actorName,
  icon,
}: {
  actorName: string | null;
  icon: AvatarIcon;
}) {
  const base =
    "flex h-9 w-9 shrink-0 items-center justify-center rounded-full";

  if (actorName) {
    return (
      <div
        aria-hidden
        className={`${base} bg-accent-50 text-accent-700 text-[12px] font-semibold`}
      >
        {initials(actorName)}
      </div>
    );
  }

  if (icon === "clock-warning") {
    return (
      <div aria-hidden className={`${base} bg-amber-50 text-amber-600`}>
        <Clock size={16} strokeWidth={2.25} />
      </div>
    );
  }

  if (icon === "alert-error") {
    return (
      <div aria-hidden className={`${base} bg-red-50 text-red-600`}>
        <AlertTriangle size={16} strokeWidth={2.25} />
      </div>
    );
  }

  // Neutral fallback (opportunity / quote / unknown, no actor).
  return (
    <div aria-hidden className={`${base} bg-crm-panel text-crm-muted`}>
      <Bell size={15} strokeWidth={2} />
    </div>
  );
}

// ─── Row ──────────────────────────────────────────────────────────────────────

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
  const { actorName, action, target, secondary, icon } = describe(notification);

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
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          handleClick();
        }
      }}
      className={[
        "group relative flex cursor-pointer select-none items-start gap-3 px-4 py-3",
        "outline-none transition-colors duration-100",
        "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-crm-blue-glow",
        !isLast && "border-b border-crm-border",
        isUnread ? "bg-crm-blue-soft/40 hover:bg-crm-blue-soft/70" : "hover:bg-crm-panel",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      {/* ── Leading avatar ── */}
      <div className="mt-0.5">
        <Avatar actorName={actorName} icon={icon} />
      </div>

      {/* ── Text content ── */}
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p
            className={[
              "min-w-0 text-[13px] leading-snug",
              isUnread ? "text-crm-text" : "text-crm-muted",
            ].join(" ")}
          >
            {actorName && (
              <span className={isUnread ? "font-semibold" : "font-medium"}>
                {actorName}{" "}
              </span>
            )}
            <span className={!actorName && isUnread ? "font-semibold" : undefined}>
              {action}
            </span>
            {target && (
              <>
                {" "}
                <span className="font-medium text-accent-700">{target}</span>
              </>
            )}
          </p>

          {/* Trailing: unread dot + relative time */}
          <span className="mt-px flex shrink-0 items-center gap-1.5">
            {isUnread && (
              <span
                aria-hidden
                className="h-1.5 w-1.5 rounded-full bg-accent-600"
              />
            )}
            <time
              className="text-[11px] tabular-nums text-crm-muted"
              dateTime={new Date(notification.createdAt).toISOString()}
              suppressHydrationWarning
            >
              {relativeTime(notification.createdAt)}
            </time>
          </span>
        </div>

        {/* Secondary supporting line */}
        {secondary && (
          <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-crm-muted">
            {secondary}
          </p>
        )}

        {/* Quiet mark-read affordance — revealed on hover, unread only */}
        {isUnread && (
          <div className="mt-1.5 flex justify-end">
            <button
              type="button"
              onClick={handleMarkReadClick}
              aria-label="Mark as read"
              className={[
                "inline-flex items-center gap-1 rounded-md px-1.5 py-0.5",
                "text-[11px] font-medium text-crm-muted",
                "opacity-0 transition group-hover:opacity-100 group-focus-within:opacity-100",
                "hover:bg-crm-panel hover:text-crm-text",
              ].join(" ")}
            >
              <Check size={11} strokeWidth={2.5} />
              Mark read
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
