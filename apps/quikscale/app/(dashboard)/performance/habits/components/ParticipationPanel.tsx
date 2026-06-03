"use client";

import { useState } from "react";
import { useHabitParticipation, type ParticipationMember } from "@/lib/hooks/useHabits";

export function ParticipationPanel({ campaignId }: { campaignId: string }) {
  const { data, isLoading } = useHabitParticipation(campaignId);
  const [showAll, setShowAll] = useState<"submitted" | "pending" | null>(null);

  if (isLoading) {
    return (
      <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5 animate-pulse">
        <div className="h-3 w-32 bg-gray-100 rounded mb-3" />
        <div className="h-2 bg-gray-100 rounded-full mb-4" />
        <div className="space-y-2">
          <div className="h-12 bg-gray-50 rounded-lg" />
          <div className="h-12 bg-gray-50 rounded-lg" />
        </div>
      </section>
    );
  }
  if (!data) return null;

  const submittedPct = data.total === 0 ? 0 : Math.round((data.submitted / data.total) * 100);
  const submitted = data.members.filter((m) => m.hasSubmitted);
  const pending = data.members.filter((m) => !m.hasSubmitted);
  const showAllSubmitted = showAll === "submitted";
  const showAllPending = showAll === "pending";
  const submittedToShow = showAllSubmitted ? submitted : submitted.slice(0, 4);
  const pendingToShow = showAllPending ? pending : pending.slice(0, 4);

  return (
    <section className="bg-white border border-gray-200 rounded-2xl shadow-sm p-4 sm:p-5">
      <header className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 tracking-tight">Participation</h3>
          <p className="text-[11px] text-gray-500 mt-0.5">
            <span className="tabular-nums">{data.submitted}</span> of{" "}
            <span className="tabular-nums">{data.total}</span> submitted ·{" "}
            <span className="tabular-nums">{submittedPct}%</span>
          </p>
        </div>
        <span className="text-xl font-bold text-gray-900 tabular-nums tracking-tight">
          {submittedPct}%
        </span>
      </header>

      <div className="h-2 bg-gray-100 rounded-full overflow-hidden mb-4">
        <div
          className="h-full bg-gradient-to-r from-accent-500 to-accent-600 rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${submittedPct}%` }}
        />
      </div>

      <div className="grid grid-cols-3 border border-gray-100 rounded-xl overflow-hidden mb-4">
        <StatCell label="Submitted" value={String(data.submitted)} accent="text-green-700" />
        <StatCell label="Pending" value={String(data.pending)} accent="text-amber-700" borderL />
        <StatCell label="Total" value={String(data.total)} accent="text-gray-900" borderL />
      </div>

      {submitted.length > 0 && (
        <section className="mb-3">
          <SectionHeader dotColor="bg-green-500" label="Submitted" count={submitted.length} />
          <ul
            className={`mt-2 space-y-1 ${
              showAllSubmitted ? "max-h-64 overflow-y-auto pr-1" : ""
            }`}
          >
            {submittedToShow.map((m) => (
              <PersonRow key={m.id} member={m} />
            ))}
          </ul>
          {submitted.length > 4 && (
            <button
              onClick={() => setShowAll(showAllSubmitted ? null : "submitted")}
              className="mt-1.5 text-[11px] font-medium text-accent-600 hover:text-accent-700"
            >
              {showAllSubmitted ? "Show less ↑" : `View all ${submitted.length} →`}
            </button>
          )}
        </section>
      )}

      {pending.length > 0 && (
        <section>
          <SectionHeader dotColor="bg-amber-500" label="Pending" count={pending.length} />
          <ul
            className={`mt-2 space-y-1 ${
              showAllPending ? "max-h-64 overflow-y-auto pr-1" : ""
            }`}
          >
            {pendingToShow.map((m) => (
              <PersonRow key={m.id} member={m} />
            ))}
          </ul>
          {pending.length > 4 && (
            <button
              onClick={() => setShowAll(showAllPending ? null : "pending")}
              className="mt-1.5 text-[11px] font-medium text-accent-600 hover:text-accent-700"
            >
              {showAllPending ? "Show less ↑" : `View all ${pending.length} →`}
            </button>
          )}
        </section>
      )}
    </section>
  );
}

function StatCell({
  label,
  value,
  accent,
  borderL = false,
}: {
  label: string;
  value: string;
  accent: string;
  borderL?: boolean;
}) {
  return (
    <div className={`text-center py-2.5 ${borderL ? "border-l border-gray-100" : ""}`}>
      <div className={`text-base font-bold tabular-nums tracking-tight ${accent}`}>{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-gray-500 mt-0.5">{label}</div>
    </div>
  );
}

function SectionHeader({
  dotColor,
  label,
  count,
}: {
  dotColor: string;
  label: string;
  count: number;
}) {
  return (
    <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-widest text-gray-600">
      <span className={`h-1.5 w-1.5 rounded-full ${dotColor}`} />
      {label} · <span className="tabular-nums">{count}</span>
    </div>
  );
}

function PersonRow({ member }: { member: ParticipationMember }) {
  return (
    <li className="flex items-center gap-2.5 px-1 py-1.5 rounded-md hover:bg-gray-50">
      <Avatar name={member.name} submitted={member.hasSubmitted} />
      <div className="min-w-0 flex-1">
        <div className="text-[12px] font-medium text-gray-900 truncate">{member.name}</div>
        {member.role && (
          <div className="text-[10px] text-gray-500 truncate uppercase tracking-wide">
            {humanizeRole(member.role)}
          </div>
        )}
      </div>
      {!member.hasSubmitted && (
        <button
          className="text-[11px] font-medium text-accent-600 hover:text-accent-700 flex-shrink-0"
          title="Nudge feature coming soon"
        >
          Nudge
        </button>
      )}
    </li>
  );
}

function Avatar({ name, submitted }: { name: string; submitted: boolean }) {
  const initials = name
    .trim()
    .split(/\s+/)
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase() || "?";

  const palette = pickAvatarColor(name);

  return (
    <div className="relative flex-shrink-0">
      <div
        className={`h-7 w-7 rounded-full text-[10px] font-semibold flex items-center justify-center ${palette}`}
      >
        {initials}
      </div>
      {submitted && (
        <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-green-500 border-2 border-white" />
      )}
    </div>
  );
}

const AVATAR_PALETTES = [
  "bg-blue-100 text-blue-700",
  "bg-purple-100 text-purple-700",
  "bg-pink-100 text-pink-700",
  "bg-amber-100 text-amber-700",
  "bg-emerald-100 text-emerald-700",
  "bg-indigo-100 text-indigo-700",
  "bg-rose-100 text-rose-700",
  "bg-teal-100 text-teal-700",
];

function pickAvatarColor(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return AVATAR_PALETTES[Math.abs(h) % AVATAR_PALETTES.length];
}

function humanizeRole(role: string): string {
  // Convert "super_admin" → "Super Admin", "owner" → "Owner", etc.
  return role
    .split(/[_\s]+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(" ");
}
