"use client";

/**
 * Upload Transcript modal — layered above ExportTranscriptModal. Lets a user
 * attach a `.docx` transcript by hand (client + type + date + file) when no
 * Fathom recording exists for a meeting. The created row is a normal
 * `ClientMeetingTranscript`, so it immediately works with the existing
 * viewer, export, and Gemini report-generation flow.
 */
import { useEffect, useState } from "react";

interface ClientOpt { id: string; name: string }

interface RosterMember {
  id: string;
  name: string;
  attendanceType?: "REQUIRED" | "OPTIONAL" | "EXTERNAL";
}

interface UploadedTranscript {
  id: string;
  clientId: string | null;
  type: "DAILY" | "WEEKLY" | null;
  meetingDate: string | null;
  title: string | null;
  recordingUrl: string | null;
  startedAt: string | null;
  endedAt: string | null;
  durationMinutes: number | null;
  attendees: { name?: string | null; email?: string | null }[] | null;
  summary: string | null;
  actionItems: { text?: string }[] | null;
  rawText: string | null;
  rawSegments: { speaker?: string | null; text?: string | null; timestamp?: number | string | null }[] | null;
  matchStatus: string;
  clientName: string | null;
}

export function UploadTranscriptModal({
  clients,
  initialClientId,
  onClose,
  onUploaded,
}: {
  clients: ClientOpt[];
  initialClientId: string;
  onClose: () => void;
  onUploaded: (row: UploadedTranscript) => void;
}) {
  const today = new Date().toISOString().slice(0, 10);

  const [clientId, setClientId] = useState(initialClientId || clients[0]?.id || "");
  const [type, setType] = useState<"DAILY" | "WEEKLY">("DAILY");
  const [meetingDate, setMeetingDate] = useState(today);
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Who attended. A .docx carries no participant list, so without this the
  // report can only ever prove "who spoke" — and since silence is not evidence
  // of absence, nobody is ever reported absent. A human ticking this list makes
  // it authoritative in both directions: whoever is not on it WAS absent.
  const [roster, setRoster] = useState<RosterMember[]>([]);
  const [attendeeIds, setAttendeeIds] = useState<string[]>([]);
  const [rosterLoading, setRosterLoading] = useState(false);
  const [startTime, setStartTime] = useState("");
  const [endTime, setEndTime] = useState("");

  useEffect(() => {
    if (!clientId) {
      setRoster([]);
      setAttendeeIds([]);
      return;
    }
    let cancelled = false;
    setRosterLoading(true);
    fetch(`/api/client-meetings/clients/${clientId}`)
      .then((r) => r.json())
      .then((json) => {
        if (cancelled) return;
        const members: RosterMember[] = json?.success ? json.data?.teamMembers ?? [] : [];
        setRoster(members);
        // Pre-tick everyone who was expected. Optional attendees start
        // unticked: they were never obliged to come, so the honest default is
        // "not recorded as here" rather than a presence nobody asserted.
        setAttendeeIds(members.filter((m) => m.attendanceType !== "OPTIONAL").map((m) => m.id));
      })
      .catch(() => {
        if (!cancelled) setRoster([]);
      })
      .finally(() => {
        if (!cancelled) setRosterLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  const toggleAttendee = (id: string) =>
    setAttendeeIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const submit = async () => {
    if (!file) {
      setError("Choose a .docx file to upload.");
      return;
    }
    if (!clientId) {
      setError("Choose a client.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const body = new FormData();
      body.set("file", file);
      body.set("clientId", clientId);
      body.set("type", type);
      body.set("meetingDate", meetingDate);
      if (title.trim()) body.set("title", title.trim());
      // Only send the list when the roster actually loaded. An empty array from
      // a failed fetch would be indistinguishable from "nobody came", and the
      // server treats a supplied list as authoritative.
      if (roster.length) body.set("attendeeIds", JSON.stringify(attendeeIds));
      if (startTime) body.set("startTime", startTime);
      if (endTime) body.set("endTime", endTime);

      const res = await fetch("/api/client-meetings/transcripts/upload", { method: "POST", body });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Upload failed");
      onUploaded(json.data as UploadedTranscript);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/40 p-4" role="presentation" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-5 py-3">
          <h2 className="text-base font-semibold text-gray-800">Upload Transcript</h2>
          <button onClick={onClose} className="rounded-md p-1 text-gray-400 hover:bg-gray-100" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="space-y-3 px-5 py-4">
          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          ) : null}

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Client</label>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            >
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Type</label>
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200 text-xs">
              {(["DAILY", "WEEKLY"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setType(t)}
                  className={`px-3 py-1.5 font-medium capitalize ${type === t ? "bg-accent-500 text-white" : "text-gray-600 hover:bg-gray-50"}`}
                >
                  {t.toLowerCase()}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Meeting date</label>
            <input
              type="date"
              value={meetingDate}
              onChange={(e) => setMeetingDate(e.target.value)}
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            />
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Title (optional)</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Defaults to the file name"
              className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Started at (optional)</label>
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-gray-600">Ended at (optional)</label>
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-2 py-1.5 text-xs"
              />
            </div>
          </div>

          {/* Attendance. This is the only place an uploaded transcript can learn
              who was in the room, and therefore the only way the weekly report
              can name an absentee. */}
          <div>
            <div className="mb-1 flex items-center justify-between">
              <label className="block text-xs font-medium text-gray-600">Who attended?</label>
              {roster.length ? (
                <span className="text-[11px] text-gray-400">
                  {attendeeIds.length} of {roster.length}
                </span>
              ) : null}
            </div>
            {rosterLoading ? (
              <p className="text-[11px] text-gray-400">Loading team members…</p>
            ) : roster.length === 0 ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                This client has no team members yet, so attendance can&apos;t be recorded for this
                transcript. Add them in Meeting Rhythm → Client Master.
              </p>
            ) : (
              <>
                <ul className="max-h-40 divide-y divide-gray-100 overflow-y-auto rounded-lg border border-gray-200">
                  {roster.map((m) => (
                    <li key={m.id}>
                      <label className="flex cursor-pointer items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50">
                        <input
                          type="checkbox"
                          checked={attendeeIds.includes(m.id)}
                          onChange={() => toggleAttendee(m.id)}
                          className="rounded border-gray-300 text-blue-600"
                        />
                        <span className="min-w-0 flex-1 truncate">{m.name}</span>
                        {m.attendanceType && m.attendanceType !== "REQUIRED" ? (
                          <span className="rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-semibold text-gray-500">
                            {m.attendanceType === "OPTIONAL" ? "Optional" : "External"}
                          </span>
                        ) : null}
                      </label>
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-[11px] text-gray-400">
                  Anyone left unticked is reported as absent for this meeting.
                </p>
              </>
            )}
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">Transcript file (.docx)</label>
            <input
              type="file"
              accept=".docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="w-full text-xs"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-gray-200 px-5 py-3">
          <button onClick={onClose} className="rounded-lg border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-600 hover:bg-gray-50">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={submitting}
            className="rounded-lg bg-accent-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-accent-600 disabled:opacity-50"
          >
            {submitting ? "Uploading…" : "Upload"}
          </button>
        </div>
      </div>
    </div>
  );
}
