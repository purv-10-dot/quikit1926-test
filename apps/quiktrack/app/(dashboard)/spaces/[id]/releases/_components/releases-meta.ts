export type ReleaseStatus = "UNRELEASED" | "RELEASED" | "ARCHIVED";

export interface ReleaseMember {
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string | null;
    lastName: string | null;
  } | null;
}

export interface ReleaseCounts {
  todo: number;
  inProgress: number;
  done: number;
}

export interface ReleaseListItem {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  status: ReleaseStatus;
  startDate: string | null;
  releaseDate: string | null;
  driverId: string | null;
  linkedWorkItemCount: number;
  counts: ReleaseCounts;
}

export const RELEASE_STATUS_META: Record<ReleaseStatus, { label: string; className: string }> = {
  UNRELEASED: { label: "Unreleased", className: "bg-gray-100 text-gray-700" },
  RELEASED: { label: "Released", className: "bg-green-100 text-green-800" },
  ARCHIVED: { label: "Archived", className: "bg-amber-100 text-amber-800" },
};

export function memberLabel(m: ReleaseMember): string {
  const u = m.user;
  if (!u) return "Unknown";
  const fn = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return fn || u.email;
}

export function fmtReleaseDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  return Number.isNaN(dt.getTime())
    ? "—"
    : dt.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}
