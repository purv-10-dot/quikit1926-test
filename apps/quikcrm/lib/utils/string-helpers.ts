export function initials(firstName?: string | null, lastName?: string | null): string {
  return ((firstName?.[0] ?? "") + (lastName?.[0] ?? "")).toUpperCase() || "?";
}

export function fullName(firstName?: string | null, lastName?: string | null, fallback = "—"): string {
  const v = `${firstName ?? ""} ${lastName ?? ""}`.trim();
  return v || fallback;
}

export function truncate(s: string, max = 80): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}
