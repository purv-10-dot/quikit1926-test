export type ReleaseStatus = "UNRELEASED" | "RELEASED" | "ARCHIVED";
export type ApproverStatus = "PENDING" | "APPROVED" | "CHANGES_REQUESTED";
export type RelatedLinkStatus = "OPEN" | "IN_PROGRESS" | "DONE";

export interface ReleaseApprover {
  id: string;
  releaseId: string;
  userId: string;
  status: ApproverStatus;
  comment: string | null;
  actedAt: string | null;
  createdAt: string;
}

export interface ReleaseRelatedLink {
  id: string;
  title: string;
  url: string | null;
  type: string | null;
  status: RelatedLinkStatus;
  assigneeId: string | null;
  issueId: string | null;
  /** Live data from the linked QtIssue (when issueId is set) — the card's
   * own title/status/assignee below are unrelated to this; this is what
   * renders as the extra status pill + assignee avatar on the card. */
  issue: {
    key: string;
    title: string;
    status: { name: string; color: string | null; category: string };
    assignee: { id: string; firstName: string | null; lastName: string | null; email: string } | null;
  } | null;
  createdAt: string;
}

export interface ReleaseDetail {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  sectionTitle: string | null;
  sectionText: string | null;
  status: ReleaseStatus;
  startDate: string | null;
  releaseDate: string | null;
  driverId: string | null;
  approvers: ReleaseApprover[];
  relatedLinks: ReleaseRelatedLink[];
  _count: { issues: number };
}

export interface ReleaseMember {
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

export const RELEASE_STATUS_OPTIONS: { value: ReleaseStatus; label: string }[] = [
  { value: "UNRELEASED", label: "Unreleased" },
  { value: "RELEASED", label: "Released" },
  { value: "ARCHIVED", label: "Archived" },
];

export const APPROVER_STATUS_META: Record<ApproverStatus, { label: string; className: string }> = {
  PENDING: { label: "Pending", className: "bg-gray-100 text-gray-700" },
  APPROVED: { label: "Approved", className: "bg-green-100 text-green-800" },
  CHANGES_REQUESTED: { label: "Changes requested", className: "bg-red-100 text-red-700" },
};

export const RELATED_LINK_STATUS_OPTIONS: { value: RelatedLinkStatus; label: string; className: string }[] = [
  { value: "OPEN", label: "Open", className: "bg-gray-100 text-gray-700" },
  { value: "IN_PROGRESS", label: "In progress", className: "bg-blue-100 text-blue-800" },
  { value: "DONE", label: "Done", className: "bg-green-100 text-green-800" },
];

export function memberLabel(m: ReleaseMember): string {
  const u = m.user;
  if (!u) return "Unknown";
  const fn = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return fn || u.email;
}

export function memberInitials(m: ReleaseMember): string {
  const u = m.user;
  if (!u) return "?";
  const a = (u.firstName ?? "").trim();
  const b = (u.lastName ?? "").trim();
  return ((a[0] ?? "") + (b[0] ?? "")).toUpperCase() || (u.email[0] ?? "?").toUpperCase();
}

export function toDateInput(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

export function fmtDate(iso: string | null): string {
  if (!iso) return "Not set";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? "Not set"
    : d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
