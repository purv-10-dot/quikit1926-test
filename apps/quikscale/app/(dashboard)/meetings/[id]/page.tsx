"use client";

/**
 * Meeting detail editor — /meetings/:id
 *
 * Record-keeping view (NOT a live meeting runner). Lets the user edit
 * the meeting's agenda / decisions / blockers / highlights, sync attendees,
 * mark the meeting complete, and see an integrated read-only snapshot of
 * KPI health + Priority status + open WWW items (Framing C: integration).
 *
 * The "integration" is purely display — nothing blocks closing the meeting.
 * Users just get context without leaving the page.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  ChevronLeft,
  Calendar,
  Clock,
  MapPin,
  Link as LinkIcon,
  Save,
  Trash2,
  CheckCircle2,
} from "lucide-react";
import { useMeeting, useUpdateMeeting, useDeleteMeeting } from "@/lib/hooks/useMeetings";
import { useUsers } from "@/lib/hooks/useUsers";
import { useScorecard } from "@/lib/hooks/usePerformance";
import { useConfirm } from "@quikit/ui";

interface Attendee {
  userId: string;
  attended: boolean;
  user: { id: string; firstName: string; lastName: string; email: string } | null;
}

interface MeetingDetail {
  id: string;
  name: string;
  cadence: string;
  scheduledAt: string;
  duration: number;
  location: string | null;
  meetingLink: string | null;
  agenda: string | null;
  decisions: string | null;
  blockers: string | null;
  highlights: string | null;
  startedOnTime: boolean;
  endedOnTime: boolean;
  formatFollowed: boolean;
  followUpRate: number | null;
  completedAt: string | null;
  attendees: Attendee[];
  template?: { id: string; name: string; sections: string[] } | null;
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function MeetingDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;
  const confirm = useConfirm();

  const { data, isLoading, error } = useMeeting(id);
  const { data: scorecardData } = useScorecard();
  const { data: users = [] } = useUsers();
  const updateMeeting = useUpdateMeeting(id);
  const deleteMeeting = useDeleteMeeting();

  const meeting = data as MeetingDetail | undefined;

  const [agenda, setAgenda] = useState("");
  const [decisions, setDecisions] = useState("");
  const [blockers, setBlockers] = useState("");
  const [highlights, setHighlights] = useState("");
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [startedOnTime, setStartedOnTime] = useState(false);
  const [endedOnTime, setEndedOnTime] = useState(false);
  const [formatFollowed, setFormatFollowed] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  // Hydrate local state once the meeting loads
  useEffect(() => {
    if (!meeting) return;
    setAgenda(meeting.agenda ?? "");
    setDecisions(meeting.decisions ?? "");
    setBlockers(meeting.blockers ?? "");
    setHighlights(meeting.highlights ?? "");
    setAttendeeIds(meeting.attendees.map((a) => a.userId));
    setStartedOnTime(meeting.startedOnTime);
    setEndedOnTime(meeting.endedOnTime);
    setFormatFollowed(meeting.formatFollowed);
    setDirty(false);
  }, [meeting?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  function markDirty<T>(setter: (v: T) => void) {
    return (v: T) => {
      setter(v);
      setDirty(true);
    };
  }

  async function handleSave(markComplete = false) {
    setSaveError(null);
    try {
      const payload: Record<string, unknown> = {
        agenda: agenda || null,
        decisions: decisions || null,
        blockers: blockers || null,
        highlights: highlights || null,
        startedOnTime,
        endedOnTime,
        formatFollowed,
        attendeeIds,
      };
      if (markComplete) {
        payload.completedAt = new Date().toISOString();
      }
      await updateMeeting.mutateAsync(payload);
      setDirty(false);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function handleDelete() {
    if (!(await confirm({ title: "Delete this meeting?", description: "This cannot be undone from the UI.", confirmLabel: "Delete", tone: "danger" }))) return;
    try {
      await deleteMeeting.mutateAsync(id);
      router.push(`/meetings/${meeting?.cadence ?? ""}`);
    } catch (e: unknown) {
      setSaveError(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  function toggleAttendee(uid: string) {
    setAttendeeIds((prev) =>
      prev.includes(uid) ? prev.filter((x) => x !== uid) : [...prev, uid],
    );
    setDirty(true);
  }

  if (isLoading) {
    return <div className="p-6 text-sm text-gray-400">Loading meeting…</div>;
  }
  if (error) {
    return (
      <div className="p-6 text-sm text-red-600">
        Error: {(error as Error).message}
      </div>
    );
  }
  if (!meeting) {
    return <div className="p-6 text-sm text-gray-400">Meeting not found</div>;
  }

  const cadenceBackHref =
    meeting.cadence === "daily" ? "/meetings/daily-huddle" : `/meetings/${meeting.cadence}`;
  const cadenceLabel =
    meeting.cadence.charAt(0).toUpperCase() + meeting.cadence.slice(1);

  const sc = scorecardData as
    | {
        orgScore: number;
        kpi: { total: number; onTrack: number; atRisk: number; critical: number; attainment: number };
        priority: { total: number; completed: number; rate: number };
        www: { total: number; open: number; overdue: number };
      }
    | undefined;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <Link
          href={cadenceBackHref}
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-2 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to {cadenceLabel}
        </Link>
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <h1 className="text-base font-semibold text-gray-900 truncate">
              {meeting.name}
            </h1>
            <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
              <span className="flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {fmtDate(meeting.scheduledAt)}
              </span>
              <span className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {fmtTime(meeting.scheduledAt)} · {meeting.duration} min
              </span>
              {meeting.location && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" /> {meeting.location}
                </span>
              )}
              {meeting.meetingLink && (
                <a
                  href={meeting.meetingLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 text-accent-600 hover:underline"
                >
                  <LinkIcon className="h-3 w-3" /> Join
                </a>
              )}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {meeting.completedAt && (
              <span className="text-[10px] bg-green-100 text-green-700 px-2 py-1 rounded-full font-medium">
                Completed
              </span>
            )}
            <button
              onClick={handleDelete}
              className="p-1.5 rounded-md hover:bg-red-50 text-red-500 border border-red-200"
              title="Delete meeting"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={() => handleSave(false)}
              disabled={!dirty || updateMeeting.isPending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="h-3.5 w-3.5" />
              {updateMeeting.isPending ? "Saving…" : "Save"}
            </button>
            {!meeting.completedAt && (
              <button
                onClick={() => handleSave(true)}
                disabled={updateMeeting.isPending}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50"
              >
                <CheckCircle2 className="h-3.5 w-3.5" /> Mark Complete
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <div className="max-w-6xl mx-auto grid grid-cols-12 gap-6">
          {/* Left: meeting record */}
          <div className="col-span-12 lg:col-span-8 space-y-4">
            {meeting.template && (
              <div className="bg-white border border-gray-200 rounded-xl p-4">
                <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                  Template · {meeting.template.name}
                </h2>
                <ul className="text-xs text-gray-600 space-y-1">
                  {meeting.template.sections.map((s, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span className="text-gray-400">{i + 1}.</span>
                      <span>{s}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <Section title="Agenda">
              <textarea
                value={agenda}
                onChange={(e) => markDirty(setAgenda)(e.target.value)}
                rows={4}
                placeholder="Outline the meeting agenda…"
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none"
              />
            </Section>

            <Section title="Highlights / Good news">
              <textarea
                value={highlights}
                onChange={(e) => markDirty(setHighlights)(e.target.value)}
                rows={3}
                placeholder="Wins, celebrations, things worth noting…"
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none"
              />
            </Section>

            <Section title="Decisions">
              <textarea
                value={decisions}
                onChange={(e) => markDirty(setDecisions)(e.target.value)}
                rows={4}
                placeholder="Decisions made in this meeting…"
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none"
              />
            </Section>

            <Section title="Blockers / Stuck issues">
              <textarea
                value={blockers}
                onChange={(e) => markDirty(setBlockers)(e.target.value)}
                rows={3}
                placeholder="What is stuck? Who needs help?"
                className="w-full text-sm border border-gray-200 rounded-md px-3 py-2 focus:outline-none focus:ring-1 focus:ring-accent-400 resize-none"
              />
            </Section>

            <Section title="Meeting quality">
              <div className="grid grid-cols-3 gap-2">
                <CheckLabel
                  label="Started on time"
                  checked={startedOnTime}
                  onChange={markDirty(setStartedOnTime)}
                />
                <CheckLabel
                  label="Ended on time"
                  checked={endedOnTime}
                  onChange={markDirty(setEndedOnTime)}
                />
                <CheckLabel
                  label="Format followed"
                  checked={formatFollowed}
                  onChange={markDirty(setFormatFollowed)}
                />
              </div>
            </Section>

            {saveError && (
              <div className="bg-red-50 border border-red-200 rounded-md px-3 py-2 text-xs text-red-700">
                {saveError}
              </div>
            )}
          </div>

          {/* Right: attendees + context snapshot */}
          <div className="col-span-12 lg:col-span-4 space-y-4">
            <Section title={`Attendees · ${attendeeIds.length}`}>
              <div className="max-h-72 overflow-y-auto space-y-1 -mx-1 px-1">
                {users.length === 0 && (
                  <p className="text-xs text-gray-400">No users available.</p>
                )}
                {users.map((u) => (
                  <label
                    key={u.id}
                    className="flex items-center gap-2 py-1 px-2 rounded hover:bg-gray-50 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={attendeeIds.includes(u.id)}
                      onChange={() => toggleAttendee(u.id)}
                      className="h-3.5 w-3.5 rounded border-gray-300"
                    />
                    <span className="text-xs text-gray-700 truncate">
                      {u.firstName} {u.lastName}
                    </span>
                  </label>
                ))}
              </div>
            </Section>

            {sc && (
              <Section title="Live context">
                <div className="space-y-2 text-xs">
                  <ContextRow
                    label="KPIs"
                    value={`${sc.kpi.onTrack}/${sc.kpi.total} on track`}
                    sub={`${sc.kpi.atRisk} at risk · ${sc.kpi.critical} critical`}
                  />
                  <ContextRow
                    label="Priorities"
                    value={`${sc.priority.completed}/${sc.priority.total} done`}
                    sub={`${sc.priority.rate}% complete`}
                  />
                  <ContextRow
                    label="WWW"
                    value={`${sc.www.open} open`}
                    sub={`${sc.www.overdue} overdue`}
                  />
                  <div className="pt-2 mt-2 border-t border-gray-100">
                    <Link
                      href="/kpi"
                      className="block text-[10px] text-accent-600 hover:underline"
                    >
                      → Review KPIs
                    </Link>
                    <Link
                      href="/priority"
                      className="block text-[10px] text-accent-600 hover:underline"
                    >
                      → Review priorities
                    </Link>
                    <Link
                      href="/www"
                      className="block text-[10px] text-accent-600 hover:underline"
                    >
                      → Review WWW
                    </Link>
                  </div>
                </div>
              </Section>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded-xl p-4">
      <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
        {title}
      </h2>
      {children}
    </section>
  );
}

function CheckLabel({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center gap-2 text-xs text-gray-700 py-1.5 px-2 rounded border border-gray-200 hover:bg-gray-50 cursor-pointer">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-3.5 w-3.5 rounded border-gray-300"
      />
      {label}
    </label>
  );
}

function ContextRow({
  label,
  value,
  sub,
}: {
  label: string;
  value: string;
  sub: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="min-w-0">
        <p className="text-[10px] text-gray-400 uppercase tracking-wider">{label}</p>
        <p className="text-sm font-semibold text-gray-900">{value}</p>
      </div>
      <span className="text-[10px] text-gray-500 text-right">{sub}</span>
    </div>
  );
}
