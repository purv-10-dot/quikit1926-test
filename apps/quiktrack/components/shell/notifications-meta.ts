export interface NotificationActor {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatarUrl: string | null;
}

export interface NotificationRow {
  id: string;
  tab: "direct" | "watching" | string;
  type: string;
  actor: NotificationActor | null;
  projectId: string | null;
  issueId: string | null;
  issueKey: string | null;
  issueTitle: string | null;
  commentId: string | null;
  snippet: string | null;
  fromValue: string | null;
  toValue: string | null;
  isRead: boolean;
  readAt: string | null;
  emailSent: boolean;
  createdAt: string;
}

export const ITEM_LABEL: Record<string, string> = {
  MENTION: "mentioned you on",
  ASSIGNED: "assigned you to",
  REASSIGNED: "changed the assignee of",
  REPORTER: "set you as reporter on",
  STATUS_CHANGED: "changed the status of",
  PRIORITY_CHANGED: "changed the priority of",
  SPRINT_MOVED: "moved",
  COMMENTED: "commented on",
  WATCHED_UPDATE: "updated",
  OVERDUE: "flagged as overdue",
};

export function summarise(n: NotificationRow): string | null {
  if (n.snippet) return n.snippet;
  if (
    n.type === "STATUS_CHANGED" ||
    n.type === "PRIORITY_CHANGED" ||
    n.type === "SPRINT_MOVED" ||
    n.type === "REASSIGNED"
  ) {
    if (n.fromValue && n.toValue) return `${n.fromValue} → ${n.toValue}`;
    if (n.toValue) return n.toValue;
  }
  return n.issueTitle ?? null;
}
