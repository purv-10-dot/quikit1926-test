"use client";

/**
 * Meeting History — searchable archive across all cadences
 *
 * Client-side filter + search on top of the full meeting list for the
 * tenant. Useful for retrospectives, audit trails, and finding past
 * decisions without remembering which specific cadence/page they live on.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { ChevronLeft, Search, Calendar, Clock, MapPin } from "lucide-react";
import { useMeetings } from "@/lib/hooks/useMeetings";
import { CADENCES, type Cadence } from "@/lib/schemas/meetingSchema";

interface MeetingRow {
  id: string;
  name: string;
  cadence: string;
  scheduledAt: string;
  duration: number;
  location: string | null;
  completedAt: string | null;
  attendees: { userId: string; attended: boolean }[];
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

const CADENCE_LABELS: Record<Cadence, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  annual: "Annual",
};

export default function MeetingHistoryPage() {
  const [search, setSearch] = useState("");
  const [cadenceFilter, setCadenceFilter] = useState<Cadence | "">("");
  const [completedOnly, setCompletedOnly] = useState(false);

  const { data, isLoading, error } = useMeetings(
    cadenceFilter ? { cadence: cadenceFilter } : {},
  );
  const meetings = useMemo(() => (data as MeetingRow[] | undefined) ?? [], [data]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return meetings
      .filter((m) => {
        if (completedOnly && !m.completedAt) return false;
        if (q) {
          const hay = `${m.name} ${m.location ?? ""}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort(
        (a, b) =>
          new Date(b.scheduledAt).getTime() - new Date(a.scheduledAt).getTime(),
      );
  }, [meetings, search, completedOnly]);

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <Link
          href="/meetings"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-2 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Meeting Rhythm
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-gray-900">Meeting History</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Full archive of past and upcoming meetings across every cadence.
            </p>
          </div>
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium whitespace-nowrap">
            {filtered.length} of {meetings.length}
          </span>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 mt-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-gray-400" />
            <input
              type="text"
              placeholder="Search by name or location…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-xs border border-gray-200 rounded-md focus:outline-none focus:ring-1 focus:ring-accent-400 w-full"
            />
          </div>
          <select
            value={cadenceFilter}
            onChange={(e) => setCadenceFilter(e.target.value as Cadence | "")}
            className="text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400"
          >
            <option value="">All cadences</option>
            {CADENCES.map((c) => (
              <option key={c} value={c}>
                {CADENCE_LABELS[c]}
              </option>
            ))}
          </select>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
            <input
              type="checkbox"
              checked={completedOnly}
              onChange={(e) => setCompletedOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-gray-300"
            />
            Completed only
          </label>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        {isLoading && (
          <div className="text-sm text-gray-400 text-center py-12">Loading…</div>
        )}
        {error && (
          <div className="text-sm text-red-600 text-center py-12">
            Error: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && filtered.length === 0 && (
          <div className="text-sm text-gray-400 text-center py-12">
            No meetings match your filters.
          </div>
        )}
        <div className="max-w-5xl mx-auto space-y-2">
          {filtered.map((m) => (
            <Link
              key={m.id}
              href={`/meetings/${m.id}`}
              className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-accent-300 hover:shadow-sm transition-all"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-sm font-semibold text-gray-900 truncate">
                      {m.name}
                    </h3>
                    <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium uppercase tracking-wider">
                      {m.cadence}
                    </span>
                    {m.completedAt && (
                      <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
                        Completed
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 text-xs text-gray-500">
                    <span className="flex items-center gap-1">
                      <Calendar className="h-3 w-3" />
                      {fmtDate(m.scheduledAt)}
                    </span>
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {fmtTime(m.scheduledAt)} · {m.duration}m
                    </span>
                    {m.location && (
                      <span className="flex items-center gap-1 truncate">
                        <MapPin className="h-3 w-3 flex-shrink-0" />
                        <span className="truncate">{m.location}</span>
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
