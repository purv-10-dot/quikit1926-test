"use client";

/**
 * Meeting Rhythm Dashboard — landing page for /meetings
 *
 * Shows a Scaling Up-style cadence overview: for each cadence, surface the
 * next scheduled meeting and the most recent past meeting, plus a link to
 * the cadence's dedicated list page. Pure read-only — this is the
 * "where are we in the rhythm right now?" view.
 */

import Link from "next/link";
import {
  Calendar,
  Clock,
  ChevronRight,
  CalendarDays,
  CalendarClock,
  CalendarCheck,
} from "lucide-react";
import { useMeetings } from "@/lib/hooks/useMeetings";
import type { Cadence } from "@/lib/schemas/meetingSchema";

interface MeetingRow {
  id: string;
  name: string;
  cadence: string;
  scheduledAt: string;
  duration: number;
  completedAt: string | null;
}

const CADENCE_CONFIG: Array<{
  cadence: Cadence;
  title: string;
  description: string;
  href: string;
  icon: React.ElementType;
  accent: string;
}> = [
  {
    cadence: "daily",
    title: "Daily Huddle",
    description: "5-15 min stand-up",
    href: "/meetings/daily-huddle",
    icon: Clock,
    accent: "from-accent-50 to-white border-accent-200",
  },
  {
    cadence: "weekly",
    title: "Weekly Meeting",
    description: "60-90 min · KPI + priorities + WWW",
    href: "/meetings/weekly",
    icon: CalendarDays,
    accent: "from-blue-50 to-white border-blue-200",
  },
  {
    cadence: "monthly",
    title: "Monthly Meeting",
    description: "Half day · learning + coaching",
    href: "/meetings/monthly",
    icon: CalendarClock,
    accent: "from-purple-50 to-white border-purple-200",
  },
  {
    cadence: "quarterly",
    title: "Quarterly Offsite",
    description: "1-2 days · review + re-plan",
    href: "/meetings/quarterly",
    icon: CalendarCheck,
    accent: "from-amber-50 to-white border-amber-200",
  },
  {
    cadence: "annual",
    title: "Annual Planning",
    description: "1-3 days · vision + BHAG",
    href: "/meetings/annual",
    icon: Calendar,
    accent: "from-emerald-50 to-white border-emerald-200",
  },
];

function fmtShort(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function relativeDays(iso: string): string {
  const diffMs = new Date(iso).getTime() - Date.now();
  const diffDays = Math.round(diffMs / 86_400_000);
  if (diffDays === 0) return "today";
  if (diffDays === 1) return "tomorrow";
  if (diffDays === -1) return "yesterday";
  if (diffDays > 0) return `in ${diffDays} days`;
  return `${-diffDays} days ago`;
}

export default function MeetingRhythmDashboard() {
  const { data: allMeetings = [] } = useMeetings({});
  const meetings = allMeetings as MeetingRow[];

  const byCadence = new Map<string, MeetingRow[]>();
  for (const m of meetings) {
    if (!byCadence.has(m.cadence)) byCadence.set(m.cadence, []);
    byCadence.get(m.cadence)!.push(m);
  }

  const now = Date.now();

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <h1 className="text-base font-semibold text-gray-900">Meeting Rhythm</h1>
        <p className="text-xs text-gray-500 mt-0.5">
          Scaling Up cadences — daily huddle through annual planning. Click a card
          to see meetings for that cadence.
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-w-7xl mx-auto">
          {CADENCE_CONFIG.map((cfg) => {
            const all = byCadence.get(cfg.cadence) ?? [];
            const upcoming = all
              .filter((m) => new Date(m.scheduledAt).getTime() >= now && !m.completedAt)
              .sort(
                (a, b) =>
                  new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime(),
              );
            const past = all
              .filter((m) => new Date(m.scheduledAt).getTime() < now || m.completedAt)
              .sort(
                (a, b) =>
                  new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
              );
            const next = upcoming[0];
            const last = past[0];
            const Icon = cfg.icon;

            return (
              <Link
                key={cfg.cadence}
                href={cfg.href}
                className={`block bg-gradient-to-br ${cfg.accent} border rounded-xl p-4 hover:shadow-sm transition-shadow group`}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="h-9 w-9 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                      <Icon className="h-4 w-4 text-gray-600" />
                    </div>
                    <div className="min-w-0">
                      <h2 className="text-sm font-semibold text-gray-900">{cfg.title}</h2>
                      <p className="text-[10px] text-gray-500">{cfg.description}</p>
                    </div>
                  </div>
                  <ChevronRight className="h-4 w-4 text-gray-400 group-hover:text-gray-600 transition-colors" />
                </div>
                <div className="space-y-2">
                  <MiniRow
                    label="Next"
                    text={next ? next.name : "—"}
                    sub={next ? relativeDays(next.scheduledAt) : "none scheduled"}
                  />
                  <MiniRow
                    label="Last"
                    text={last ? last.name : "—"}
                    sub={last ? fmtShort(last.scheduledAt) : "no history"}
                  />
                  <div className="text-[10px] text-gray-400 pt-1">
                    {all.length} total
                  </div>
                </div>
              </Link>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-center gap-4 text-xs">
          <Link href="/meetings/templates" className="text-accent-600 hover:underline">
            Templates →
          </Link>
          <span className="text-gray-300">·</span>
          <Link href="/meetings/history" className="text-accent-600 hover:underline">
            Full history →
          </Link>
        </div>
      </div>
    </div>
  );
}

function MiniRow({ label, text, sub }: { label: string; text: string; sub: string }) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-[10px] text-gray-400 uppercase tracking-wider w-8 flex-shrink-0 mt-0.5">
        {label}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-gray-800 truncate">{text}</p>
        <p className="text-[10px] text-gray-500">{sub}</p>
      </div>
    </div>
  );
}
