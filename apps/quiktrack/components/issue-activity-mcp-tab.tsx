"use client";

import { Bot } from "lucide-react";
import { SkeletonList } from "@/components/skeleton";

interface User {
  id: string;
  firstName: string | null;
  lastName: string | null;
  email: string;
  avatar?: string | null;
}

export interface McpLogEntry {
  id: string;
  createdAt: string;
  actor: User | null;
  actorType: string;
  tool: string;
  action: string;
  result: "success" | "error";
  errorMessage: string | null;
}

function userName(u: User | null): string {
  if (!u) return "Unknown";
  const fn = `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim();
  return fn || u.email;
}
function userInitials(u: User | null): string {
  if (!u) return "?";
  const f = (u.firstName ?? "").trim();
  const l = (u.lastName ?? "").trim();
  if (f || l) return `${f.charAt(0)}${l.charAt(0)}`.toUpperCase() || "?";
  return (u.email?.charAt(0) ?? "?").toUpperCase();
}
function userColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}
function relativeTime(iso: string): string {
  const t = new Date(iso).getTime();
  const diff = Date.now() - t;
  const sec = Math.floor(diff / 1000);
  if (sec < 5) return "just now";
  if (sec < 60) return `${sec} second${sec === 1 ? "" : "s"} ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min} minute${min === 1 ? "" : "s"} ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} hour${hr === 1 ? "" : "s"} ago`;
  const day = Math.floor(hr / 24);
  if (day === 1) return "yesterday";
  if (day < 30) return `${day} day${day === 1 ? "" : "s"} ago`;
  return new Date(iso).toLocaleDateString();
}

function AutomatedBadge() {
  return (
    <span
      title="Automated via MCP"
      className="inline-flex items-center justify-center h-4 w-4 rounded bg-gray-100 text-gray-500 shrink-0"
    >
      <Bot className="h-3 w-3" />
    </span>
  );
}

/** QUIKTR-121 — the issue detail page's "MCP Log" activity tab, showing
 *  QtMcpActionLog entries scoped to this one issue. */
export function McpLogView({ rows, sortDesc }: { rows: McpLogEntry[] | null; sortDesc: boolean }) {
  const ordered = rows ? (sortDesc ? [...rows].reverse() : rows) : null;
  if (ordered === null) {
    return <SkeletonList rows={3} withAvatar />;
  }
  if (ordered.length === 0) {
    return <div className="text-xs text-gray-400">No MCP actions on this issue yet.</div>;
  }
  return (
    <div className="space-y-3">
      {ordered.map((r) => (
        <div key={r.id} className="flex items-start gap-2">
          <span
            className="h-7 w-7 rounded-full flex items-center justify-center text-white text-[11px] font-semibold shrink-0"
            style={{ background: userColor(r.actor?.id ?? r.id) }}
          >
            {userInitials(r.actor)}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs text-gray-900 inline-flex items-center gap-1.5 flex-wrap">
              <span className="font-semibold">{userName(r.actor)}</span>
              <span className="text-gray-700">ran</span>
              <span className="font-mono text-gray-600">{r.tool}</span>
              {r.actorType === "agent" && <AutomatedBadge />}
              {r.result === "error" && (
                <span className="text-[11px] px-1.5 py-0.5 rounded bg-red-50 text-red-600">failed</span>
              )}
            </div>
            <div className="text-[11px] text-gray-500 mt-0.5">{relativeTime(r.createdAt)}</div>
            {r.result === "error" && r.errorMessage && (
              <div className="mt-1 text-[11px] text-red-600">{r.errorMessage}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
