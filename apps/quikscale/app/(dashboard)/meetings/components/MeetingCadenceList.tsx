"use client";

/**
 * Shared list component for the 4 non-Daily meeting cadences
 * (weekly / monthly / quarterly / annual).
 *
 * Each cadence page in `/meetings/<cadence>` is a thin wrapper that
 * passes its cadence + title to this component. This keeps the 4 pages
 * at ~10 lines each and guarantees they stay consistent.
 *
 * Framing A + record-keeping + just-another-page: this is a plain list
 * view, NOT a live meeting runner. Click a row to open detail.
 */

import { useState, useMemo } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calendar, MapPin, Users as UsersIcon, Clock } from "lucide-react";
import { useMeetings, useCreateMeeting, useMeetingTemplates } from "@/lib/hooks/useMeetings";
import { useUsers } from "@/lib/hooks/useUsers";
import { AddButton, EmptyState } from "@quikit/ui";
import type { Cadence } from "@/lib/schemas/meetingSchema";

const CADENCE_COPY: Record<Cadence, { title: string; message: string; cta: string }> = {
  daily: {
    title: "Schedule your first daily huddle",
    message: "A 5-15 minute daily stand-up keeps your team in sync. Share blockers, commitments, and focus for the day.",
    cta: "Schedule first huddle",
  },
  weekly: {
    title: "Schedule your first weekly meeting",
    message: "A 60-90 minute weekly cadence to review KPIs, check priorities, surface stuck issues, and generate WWW commitments.",
    cta: "Schedule first weekly",
  },
  monthly: {
    title: "Schedule your first monthly meeting",
    message: "A half-day each month for deeper learning, coaching, and cross-team alignment — away from the weekly grind.",
    cta: "Schedule first monthly",
  },
  quarterly: {
    title: "Schedule your first quarterly offsite",
    message: "1-2 days to review the quarter, reset priorities, and plan the next 90 days as a leadership team.",
    cta: "Schedule first quarterly",
  },
  annual: {
    title: "Schedule your first annual planning session",
    message: "1-3 days to revisit vision, set BHAGs, and align on the year ahead. The foundation of the Scaling Up rhythm.",
    cta: "Schedule first annual",
  },
};

interface MeetingRow {
  id: string;
  name: string;
  cadence: string;
  scheduledAt: string;
  duration: number;
  location: string | null;
  meetingLink: string | null;
  completedAt: string | null;
  attendees: { userId: string; attended: boolean }[];
}

interface Template {
  id: string;
  name: string;
  cadence: string;
  sections: string[];
  duration: number;
}

interface Props {
  cadence: Cadence;
  title: string;
  subtitle: string;
}

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
  return `${date} · ${time}`;
}

function fmtDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h}h ${m}m` : `${h}h`;
}

function toLocalDatetimeInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export function MeetingCadenceList({ cadence, title, subtitle }: Props) {
  const router = useRouter();
  const { data: meetingsData, isLoading, error } = useMeetings({ cadence });
  const { data: templatesData } = useMeetingTemplates();
  const { data: users = [] } = useUsers();
  const createMeeting = useCreateMeeting();

  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    name: "",
    scheduledAt: toLocalDatetimeInput(),
    duration: 60,
    location: "",
    meetingLink: "",
    templateId: "",
  });

  const meetings = (meetingsData as MeetingRow[] | undefined) ?? [];
  const templates = ((templatesData as Template[] | undefined) ?? []).filter(
    (t) => t.cadence === cadence,
  );

  // Sensible default duration based on cadence (matches the seeded templates)
  const defaultDuration = useMemo(() => {
    const d: Record<Cadence, number> = {
      daily: 15,
      weekly: 90,
      monthly: 240,
      quarterly: 480,
      annual: 1440,
    };
    return d[cadence];
  }, [cadence]);

  function openModal() {
    setForm({
      name: "",
      scheduledAt: toLocalDatetimeInput(),
      duration: defaultDuration,
      location: "",
      meetingLink: "",
      templateId: templates[0]?.id ?? "",
    });
    setFormError(null);
    setShowModal(true);
  }

  async function handleCreate() {
    if (!form.name.trim()) {
      setFormError("Meeting name is required");
      return;
    }
    setFormError(null);
    try {
      // Convert local datetime-input string → ISO
      const scheduledAt = new Date(form.scheduledAt).toISOString();
      const result = (await createMeeting.mutateAsync({
        name: form.name.trim(),
        cadence,
        templateId: form.templateId || null,
        scheduledAt,
        duration: form.duration,
        location: form.location || null,
        meetingLink: form.meetingLink || null,
        attendeeIds: [],
      })) as { id: string };
      setShowModal(false);
      router.push(`/meetings/${result.id}`);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to create meeting");
    }
  }

  const now = Date.now();
  const upcoming = meetings.filter(
    (m) => new Date(m.scheduledAt).getTime() >= now && !m.completedAt,
  );
  const past = meetings.filter(
    (m) => new Date(m.scheduledAt).getTime() < now || m.completedAt,
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <div>
          <h1 className="text-base font-semibold text-gray-900">{title}</h1>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full font-medium">
            {meetings.length} {meetings.length === 1 ? "meeting" : "meetings"}
          </span>
          <AddButton onClick={openModal}>Schedule Meeting</AddButton>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6 bg-gray-50 space-y-6">
        {isLoading && (
          <div className="text-sm text-gray-400 text-center py-12">Loading…</div>
        )}
        {error && (
          <div className="text-sm text-red-600 text-center py-12">
            Error: {(error as Error).message}
          </div>
        )}
        {!isLoading && !error && meetings.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl">
            <EmptyState
              icon={Calendar}
              title={CADENCE_COPY[cadence].title}
              message={CADENCE_COPY[cadence].message}
              action={{ label: CADENCE_COPY[cadence].cta, onClick: openModal }}
            />
          </div>
        )}

        {upcoming.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Upcoming
            </h2>
            <div className="space-y-2">
              {upcoming.map((m) => (
                <MeetingCard key={m.id} meeting={m} users={users} />
              ))}
            </div>
          </section>
        )}

        {past.length > 0 && (
          <section>
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
              Past
            </h2>
            <div className="space-y-2">
              {past.map((m) => (
                <MeetingCard key={m.id} meeting={m} users={users} />
              ))}
            </div>
          </section>
        )}
      </div>

      {/* Create modal */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col max-h-[90vh]">
            <div className="flex items-center justify-between px-6 pt-5 pb-3">
              <h2 className="text-sm font-semibold text-gray-900">
                Schedule {title.replace(" Meeting", "")} Meeting
              </h2>
              <button
                onClick={() => setShowModal(false)}
                className="text-gray-400 hover:text-gray-600 text-xl leading-none"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 space-y-3 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Meeting name *
                </label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder={`e.g. ${title} — week of Apr 14`}
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                  autoFocus
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  When *
                </label>
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Duration (minutes)
                </label>
                <input
                  type="number"
                  min={1}
                  value={form.duration}
                  onChange={(e) =>
                    setForm({ ...form, duration: parseInt(e.target.value, 10) || 0 })
                  }
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>

              {templates.length > 0 && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">
                    Template
                  </label>
                  <select
                    value={form.templateId}
                    onChange={(e) => setForm({ ...form, templateId: e.target.value })}
                    className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400"
                  >
                    <option value="">No template</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Location
                </label>
                <input
                  type="text"
                  value={form.location}
                  onChange={(e) => setForm({ ...form, location: e.target.value })}
                  placeholder="Boardroom / Office / Remote"
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Meeting link
                </label>
                <input
                  type="url"
                  value={form.meetingLink}
                  onChange={(e) => setForm({ ...form, meetingLink: e.target.value })}
                  placeholder="https://..."
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>

              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 pb-5 pt-2 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={createMeeting.isPending}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-md disabled:opacity-50"
              >
                {createMeeting.isPending ? "Creating…" : "Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MeetingCard({
  meeting,
  users,
}: {
  meeting: MeetingRow;
  users: Array<{ id: string; firstName: string; lastName: string }>;
}) {
  const attendeeCount = meeting.attendees?.length ?? 0;
  const userMap = new Map(users.map((u) => [u.id, u]));
  return (
    <Link
      href={`/meetings/${meeting.id}`}
      className="block bg-white border border-gray-200 rounded-xl p-4 hover:border-accent-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 truncate">{meeting.name}</h3>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Calendar className="h-3 w-3" />
              {fmtDateTime(meeting.scheduledAt)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="h-3 w-3" />
              {fmtDuration(meeting.duration)}
            </span>
            {meeting.location && (
              <span className="flex items-center gap-1 truncate">
                <MapPin className="h-3 w-3 flex-shrink-0" />
                <span className="truncate">{meeting.location}</span>
              </span>
            )}
            {attendeeCount > 0 && (
              <span className="flex items-center gap-1">
                <UsersIcon className="h-3 w-3" />
                {attendeeCount}
              </span>
            )}
          </div>
        </div>
        {meeting.completedAt && (
          <span className="text-[10px] bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium flex-shrink-0">
            Completed
          </span>
        )}
      </div>
    </Link>
  );
}
