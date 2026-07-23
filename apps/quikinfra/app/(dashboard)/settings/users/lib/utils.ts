/** Pure helpers for the User Management page. Extracted from page.tsx. */

export function memberInitials(first?: string | null, last?: string | null) {
  return (`${first?.[0] ?? ""}${last?.[0] ?? ""}`.toUpperCase() || "?");
}

export function memberAvatarColor(name: string) {
  const colors = [
    "bg-blue-500", "bg-purple-500", "bg-green-500", "bg-orange-500",
    "bg-pink-500", "bg-teal-500", "bg-red-500", "bg-indigo-500",
  ];
  let hash = 0;
  for (const c of name) hash = (hash * 31 + c.charCodeAt(0)) & 0xffffffff;
  return colors[Math.abs(hash) % colors.length];
}
