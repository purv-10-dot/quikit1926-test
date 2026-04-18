"use client";

/**
 * 1:1 Meetings — /performance/one-on-one
 *
 * R10g: manager/report recurring syncs. Default view shows all 1:1s where
 * the current user is EITHER manager or report. Click a session to edit
 * talking points, action items, notes, and mood.
 */

import { useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { ChevronLeft, Clock, Users as UsersIcon } from "lucide-react";
import {
  useOneOnOnes,
  useCreateOneOnOne,
} from "@/lib/hooks/useOneOnOne";
import { useUsers } from "@/lib/hooks/useUsers";
import { AddButton } from "@quikit/ui";

interface SessionRow {
  id: string;
  managerId: string;
  reportId: string;
  scheduledAt: string;
  duration: number;
  mood: string | null;
  completedAt: string | null;
  manager: { id: string; firstName: string; lastName: string };
  report: { id: string; firstName: string; lastName: string };
}

function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function toLocalDatetimeInput(): string {
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
}

export default function OneOnOnePage() {
  const { data: session } = useSession();
  const userId = session?.user?.id as string | undefined;
  const { data, isLoading, error } = useOneOnOnes();
  const { data: users = [] } = useUsers();
  const createOneOnOne = useCreateOneOnOne();

  const sessions = (data as SessionRow[] | undefined) ?? [];

  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [form, setForm] = useState({
    managerId: userId ?? "",
    reportId: "",
    scheduledAt: toLocalDatetimeInput(),
    duration: 30,
    talkingPoints: "",
  });

  async function handleCreate() {
    if (!form.reportId || !form.managerId) {
      setFormError("Both manager and report are required");
      return;
    }
    if (form.managerId === form.reportId) {
      setFormError("Manager and report cannot be the same person");
      return;
    }
    setFormError(null);
    try {
      await createOneOnOne.mutateAsync({
        managerId: form.managerId,
        reportId: form.reportId,
        scheduledAt: new Date(form.scheduledAt).toISOString(),
        duration: form.duration,
        talkingPoints: form.talkingPoints || null,
      });
      setShowModal(false);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to schedule");
    }
  }

  const now = Date.now();
  const upcoming = sessions.filter(
    (s) => new Date(s.scheduledAt).getTime() >= now && !s.completedAt,
  );
  const past = sessions.filter(
    (s) => new Date(s.scheduledAt).getTime() < now || s.completedAt,
  );

  return (
    <div className="flex flex-col h-full">
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <Link
          href="/performance/cycle"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-2 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Cycle
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-gray-900">1:1 Meetings</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Manager/report syncs. Talking points carry forward from session to session.
            </p>
          </div>
          <AddButton onClick={() => setShowModal(true)}>Schedule 1:1</AddButton>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gray-50">
        <div className="max-w-4xl mx-auto space-y-6">
          {isLoading && (
            <div className="text-sm text-gray-400 text-center py-12">Loading…</div>
          )}
          {error && (
            <div className="text-sm text-red-600 text-center py-12">
              Error: {(error as Error).message}
            </div>
          )}
          {!isLoading && sessions.length === 0 && (
            <div className="bg-white border border-gray-200 rounded-xl p-10 text-center">
              <UsersIcon className="h-8 w-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-gray-500">No 1:1s yet.</p>
              <p className="text-xs text-gray-400 mt-1">
                Click <span className="font-semibold">Schedule 1:1</span> to start.
              </p>
            </div>
          )}

          {upcoming.length > 0 && (
            <section>
              <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Upcoming
              </h2>
              <div className="space-y-2">
                {upcoming.map((s) => (
                  <SessionCard key={s.id} session={s} currentUserId={userId} />
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
                {past.map((s) => (
                  <SessionCard key={s.id} session={s} currentUserId={userId} />
                ))}
              </div>
            </section>
          )}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md flex flex-col">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100">
              <h2 className="text-sm font-semibold text-gray-900">Schedule 1:1</h2>
            </div>
            <div className="px-6 py-4 space-y-3">
              <Field label="Manager *">
                <select
                  value={form.managerId}
                  onChange={(e) => setForm({ ...form, managerId: e.target.value })}
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white"
                >
                  <option value="">Select…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Report *">
                <select
                  value={form.reportId}
                  onChange={(e) => setForm({ ...form, reportId: e.target.value })}
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white"
                >
                  <option value="">Select…</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.firstName} {u.lastName}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="When *">
                <input
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) =>
                    setForm({ ...form, scheduledAt: e.target.value })
                  }
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5"
                />
              </Field>
              <Field label="Duration (minutes)">
                <input
                  type="number"
                  min={1}
                  value={form.duration}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      duration: parseInt(e.target.value, 10) || 0,
                    })
                  }
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5"
                />
              </Field>
              <Field label="Talking points">
                <textarea
                  value={form.talkingPoints}
                  onChange={(e) =>
                    setForm({ ...form, talkingPoints: e.target.value })
                  }
                  rows={3}
                  placeholder="What do you want to cover?"
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 resize-none"
                />
              </Field>
              {formError && <p className="text-xs text-red-500">{formError}</p>}
            </div>
            <div className="flex items-center justify-end gap-2 px-6 py-3 border-t border-gray-100">
              <button
                onClick={() => setShowModal(false)}
                className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-md"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={createOneOnOne.isPending}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-md disabled:opacity-50"
              >
                {createOneOnOne.isPending ? "Creating…" : "Schedule"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-gray-700 mb-1">{label}</label>
      {children}
    </div>
  );
}

function SessionCard({
  session,
  currentUserId,
}: {
  session: SessionRow;
  currentUserId: string | undefined;
}) {
  const isManager = session.managerId === currentUserId;
  const other = isManager ? session.report : session.manager;
  const role = isManager ? "Report" : "Manager";

  return (
    <div className="bg-white border border-gray-200 rounded-xl p-4 flex items-start justify-between gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 mb-1">
          <h3 className="text-sm font-semibold text-gray-900 truncate">
            {other.firstName} {other.lastName}
          </h3>
          <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-medium">
            {role}
          </span>
          {session.completedAt && (
            <span className="text-[10px] bg-green-100 text-green-700 px-1.5 py-0.5 rounded-full font-medium">
              Completed
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span>{fmtDateTime(session.scheduledAt)}</span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" /> {session.duration} min
          </span>
          {session.mood && (
            <span
              className={`w-2 h-2 rounded-full ${
                session.mood === "green"
                  ? "bg-green-500"
                  : session.mood === "yellow"
                    ? "bg-yellow-500"
                    : "bg-red-500"
              }`}
              title={`Mood: ${session.mood}`}
            />
          )}
        </div>
      </div>
    </div>
  );
}
