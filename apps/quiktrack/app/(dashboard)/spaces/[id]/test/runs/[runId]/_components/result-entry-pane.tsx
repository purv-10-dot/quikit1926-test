"use client";

import { useEffect, useRef, useState } from "react";
import { Lock, Pause, Play, RotateCcw } from "lucide-react";
import { Button, Textarea } from "@quikit/ui";
import { AssigneePicker, type MemberOption } from "./assignee-picker";

/** Current-status pill (QUIKTR-318). Semantic data states → fixed colours. */
const CURRENT_PILL: Record<string, string> = {
  passed: "bg-green-100 text-green-800",
  automation_passed: "bg-green-100 text-green-900",
  failed: "bg-rose-100 text-rose-800",
  automation_failed: "bg-red-100 text-red-900",
  automation_error: "bg-gray-200 text-gray-700",
  blocked: "bg-gray-200 text-gray-800",
  skipped: "bg-yellow-100 text-yellow-800",
  retest: "bg-blue-100 text-blue-800",
  untested: "bg-gray-100 text-gray-600",
};
import {
  formatElapsed,
  type TestDetail,
  type TestStatusLite,
} from "./runner-types";

/**
 * Right pane — record the outcome.
 *
 * Deliberately NOT a modal: the run's "no page reload between cases"
 * requirement means result entry has to sit beside the steps, so a tester can
 * read and record without losing context. The modal in the inventory (#25) is
 * only for recording from a list.
 *
 * The elapsed timer is opt-in. It starts on first interaction rather than on
 * mount, because a test that sat open while someone read the steps did not take
 * that long to execute, and an auto-started timer would quietly log a wrong
 * duration.
 */

interface ResultEntryPaneProps {
  detail: TestDetail | null;
  statuses: TestStatusLite[];
  onSubmit: (input: {
    statusId: string;
    comment?: string;
    elapsedMs?: number;
  }) => Promise<boolean>;
  submitting: boolean;
  /** Advance to the next test after a successful save. */
  onAdvance: () => void;
  /** Project members available to execute this run-case (QUIKTR-317). */
  members: MemberOption[];
  onReassign: (userId: string | null) => Promise<void> | void;
}

/** The primary outcomes, in the order a tester reaches for them. */
const PRIMARY_KEYS = ["passed", "failed", "blocked", "retest", "skipped"];

const PRIMARY_CLASS: Record<string, string> = {
  passed: "bg-green-600 hover:bg-green-700 text-white",
  failed: "bg-rose-600 hover:bg-rose-700 text-white",
  blocked: "bg-gray-700 hover:bg-gray-800 text-white",
  retest: "bg-blue-600 hover:bg-blue-700 text-white",
  skipped: "bg-yellow-500 hover:bg-yellow-600 text-white",
};

export function ResultEntryPane({
  detail,
  statuses,
  onSubmit,
  submitting,
  onAdvance,
  members,
  onReassign,
}: ResultEntryPaneProps) {
  const [comment, setComment] = useState("");
  const [elapsedMs, setElapsedMs] = useState(0);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const tickRef = useRef<number | null>(null);

  const closed = detail?.run.state === "closed";

  // Reset per test — a comment or duration must never carry across to the next
  // test, which would attribute one tester's notes to the wrong case.
  useEffect(() => {
    setComment("");
    setElapsedMs(0);
    setRunning(false);
    setError(null);
  }, [detail?.id]);

  useEffect(() => {
    if (!running) return;
    const started = Date.now() - elapsedMs;
    const handle = window.setInterval(() => {
      setElapsedMs(Date.now() - started);
    }, 200);
    tickRef.current = handle;
    return () => window.clearInterval(handle);
    // `elapsedMs` is intentionally excluded: including it would restart the
    // interval on every tick. The offset is captured when the timer starts.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running]);

  const record = async (statusId: string) => {
    if (!detail) return;
    setError(null);
    setRunning(false);

    const okSaved = await onSubmit({
      statusId,
      comment: comment.trim() || undefined,
      elapsedMs: elapsedMs > 0 ? Math.round(elapsedMs) : undefined,
    });

    if (okSaved) {
      onAdvance();
    } else {
      setError("Could not save that result. Nothing was recorded.");
    }
  };

  if (!detail) {
    return <div className="w-80 shrink-0 border-l border-gray-200" />;
  }

  const primary = PRIMARY_KEYS.map((key) =>
    statuses.find((s) => s.key === key),
  ).filter((s): s is TestStatusLite => Boolean(s));

  const others = statuses.filter(
    (s) => !PRIMARY_KEYS.includes(s.key) && !s.isAutomation,
  );

  return (
    <div className="flex w-80 shrink-0 flex-col border-l border-gray-200">
      <div className="border-b border-gray-200 px-4 py-2.5">
        <h3 className="text-sm font-semibold text-gray-900">Result</h3>
        {/* QUIKTR-318 — the current outcome stated plainly, not just a glyph. */}
        <p className="mt-1">
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${
              CURRENT_PILL[detail.currentStatus.key] ?? "bg-gray-100 text-gray-600"
            }`}
          >
            {detail.currentStatus.label}
          </span>
        </p>
      </div>

      {/* QUIKTR-317 — assignment is run administration, so it stays available
          even on a closed run's pane header... except the API refuses it, so the
          picker is disabled there to match. */}
      <div className="border-b border-gray-200 px-4 py-2.5">
        <p className="mb-1 text-xs font-medium text-gray-600">Assigned to</p>
        <AssigneePicker
          currentId={detail.assigneeId ?? null}
          members={members}
          onChange={onReassign}
          disabled={submitting || closed}
        />
      </div>

      {closed ? (
        <div className="p-4">
          <p className="flex items-start gap-2 rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            <span>
              This run is closed, so its results are frozen. Reopen the run to
              record more.
            </span>
          </p>
        </div>
      ) : (
        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {error && (
            <p className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}

          <div>
            <p className="mb-1.5 text-xs font-medium text-gray-600">Outcome</p>
            <div className="grid grid-cols-2 gap-1.5">
              {primary.map((s) => (
                <Button
                  key={s.id}
                  size="sm"
                  disabled={submitting}
                  onClick={() => record(s.id)}
                  className={
                    PRIMARY_CLASS[s.key] ??
                    "bg-gray-600 text-white hover:bg-gray-700"
                  }
                >
                  {s.label}
                </Button>
              ))}
            </div>
          </div>

          <div>
            <label className="mb-1 block text-xs font-medium text-gray-600">
              Comment
            </label>
            <Textarea
              rows={4}
              value={comment}
              disabled={submitting}
              placeholder="What happened? Anything a developer would need to reproduce it."
              onChange={(e) => setComment(e.target.value)}
            />
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-gray-600">Elapsed</p>
            <div className="flex items-center gap-2">
              <span className="font-mono text-sm text-gray-800">
                {elapsedMs > 0 ? formatElapsed(elapsedMs) : "—"}
              </span>
              <button
                type="button"
                onClick={() => setRunning((v) => !v)}
                className="rounded p-1 text-gray-500 hover:bg-gray-100"
                aria-label={running ? "Pause timer" : "Start timer"}
              >
                {running ? (
                  <Pause className="h-3.5 w-3.5" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
              </button>
              {elapsedMs > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    setRunning(false);
                    setElapsedMs(0);
                  }}
                  className="rounded p-1 text-gray-400 hover:bg-gray-100"
                  aria-label="Reset timer"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
            <p className="mt-1 text-[11px] text-gray-400">
              Optional. Only sent if the timer ran.
            </p>
          </div>

          {others.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-medium text-gray-600">
                Other statuses
              </p>
              <div className="flex flex-wrap gap-1.5">
                {others.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={submitting}
                    onClick={() => record(s.id)}
                    className="rounded border border-gray-200 px-2 py-1 text-xs text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
