"use client";

import { useState } from "react";
import { Bot, ChevronDown, ChevronRight, ExternalLink, Paperclip, User } from "lucide-react";
import { useApiData } from "@/lib/hooks/useApiData";
import { formatElapsed } from "./runner-types";

/**
 * Result history for one run-case (QUIKTR-340).
 *
 * `QtTestResult` is append-only by database trigger, so this is the real
 * execution record rather than a reconstruction — every entry is a result that was
 * actually written, newest first. That is exactly why it is worth showing: a test
 * that has flipped pass→fail→pass three times is telling you something a single
 * current status cannot.
 *
 * The endpoint (`GET /api/test/tests/{id}/results`) has existed since P2 and was
 * simply never rendered.
 */

interface ResultHistoryEntry {
  id: string;
  source: string;
  executedAt: string;
  elapsedMs: number | null;
  comment: string | null;
  failureMessage: string | null;
  stackTrace: string | null;
  build: string | null;
  ciUrl: string | null;
  status: { id: string; key: string; label: string; color: string } | null;
  actor: { id: string; firstName: string; lastName: string } | null;
  attachments: Array<{ id: string; fileName: string }>;
  defectLinks: Array<{ id: string; issueId: string }>;
  stepResults: Array<{
    id: string;
    stepId: string;
    comment: string | null;
    status: { key: string; label: string } | null;
  }>;
}

export function ResultHistory({ testId }: { testId: string | null }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const { data, isLoading } = useApiData<ResultHistoryEntry[]>(
    ["quiktrack", "test-results", testId],
    testId ? `/api/test/tests/${testId}/results` : null,
    { staleTime: 0 },
  );

  const entries = data ?? [];

  const toggle = (id: string) =>
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  if (!testId) return null;

  return (
    <div className="mt-6 border-t border-gray-200 pt-4">
      <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
        Result history
      </h3>

      {isLoading ? (
        <p className="mt-2 text-sm text-gray-400">Loading history…</p>
      ) : entries.length === 0 ? (
        <p className="mt-2 text-sm text-gray-500">
          Not executed yet. Each result recorded against this test is kept here —
          nothing is ever overwritten.
        </p>
      ) : (
        <>
          <p className="mt-1 text-[11px] text-gray-400">
            {entries.length} result{entries.length === 1 ? "" : "s"}, newest first.
            Results are append-only, so this is the full record.
          </p>

          <ol className="mt-2 space-y-1.5">
            {entries.map((e, i) => {
              const isOpen = expanded.has(e.id);
              const hasDetail =
                Boolean(e.failureMessage) ||
                Boolean(e.stackTrace) ||
                e.stepResults.length > 0 ||
                e.attachments.length > 0 ||
                e.defectLinks.length > 0;

              return (
                <li
                  key={e.id}
                  className="rounded border border-gray-200 px-2.5 py-1.5"
                >
                  <div className="flex items-start gap-2">
                    <span
                      className="mt-1.5 inline-block h-2 w-2 shrink-0 rounded-full"
                      // Colour comes from the status ROW, not a hardcoded map:
                      // statuses are org-editable, so a custom status still gets
                      // its own colour here.
                      style={{ backgroundColor: e.status?.color ?? "#94a3b8" }}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-gray-800">
                        <span className="font-medium">
                          {e.status?.label ?? "Unknown status"}
                        </span>
                        {i === 0 && (
                          <span className="ml-1.5 rounded bg-gray-100 px-1 text-[10px] text-gray-500">
                            current
                          </span>
                        )}
                      </p>

                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[11px] text-gray-500">
                        <span className="inline-flex items-center gap-1">
                          {e.source === "manual" ? (
                            <User className="h-3 w-3" />
                          ) : (
                            <Bot className="h-3 w-3" />
                          )}
                          {/* An automated result has no human actor; say "CI"
                              rather than leaving it blank or inventing a name. */}
                          {e.actor
                            ? `${e.actor.firstName} ${e.actor.lastName}`.trim()
                            : e.source === "manual"
                              ? "Unknown user"
                              : "CI"}
                        </span>
                        <span>{new Date(e.executedAt).toLocaleString()}</span>
                        {e.elapsedMs != null && e.elapsedMs > 0 && (
                          <span>{formatElapsed(e.elapsedMs)}</span>
                        )}
                        {e.build && <span>build {e.build}</span>}
                        {e.ciUrl && (
                          <a
                            href={e.ciUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 text-accent-700 hover:underline"
                          >
                            CI run
                            <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </p>

                      {e.comment && (
                        <p className="mt-1 whitespace-pre-wrap text-xs text-gray-700">
                          {e.comment}
                        </p>
                      )}

                      {hasDetail && (
                        <button
                          type="button"
                          onClick={() => toggle(e.id)}
                          className="mt-1 inline-flex items-center gap-0.5 text-[11px] text-gray-500 hover:text-gray-800"
                        >
                          {isOpen ? (
                            <ChevronDown className="h-3 w-3" />
                          ) : (
                            <ChevronRight className="h-3 w-3" />
                          )}
                          {isOpen ? "Hide" : "Show"} details
                        </button>
                      )}

                      {isOpen && (
                        <div className="mt-1.5 space-y-1.5">
                          {e.failureMessage && (
                            <p className="whitespace-pre-wrap rounded bg-rose-50 px-2 py-1 font-mono text-[11px] text-rose-800">
                              {e.failureMessage}
                            </p>
                          )}
                          {e.stackTrace && (
                            <pre className="max-h-40 overflow-auto rounded bg-gray-50 px-2 py-1 font-mono text-[10px] text-gray-600">
                              {e.stackTrace}
                            </pre>
                          )}

                          {e.stepResults.length > 0 && (
                            <ul className="space-y-0.5">
                              {e.stepResults.map((s, si) => (
                                <li key={s.id} className="text-[11px] text-gray-600">
                                  Step {si + 1}: {s.status?.label ?? "—"}
                                  {s.comment ? ` — ${s.comment}` : ""}
                                </li>
                              ))}
                            </ul>
                          )}

                          {e.attachments.length > 0 && (
                            <p className="flex flex-wrap items-center gap-2 text-[11px] text-gray-600">
                              {e.attachments.map((a) => (
                                <span key={a.id} className="inline-flex items-center gap-1">
                                  <Paperclip className="h-2.5 w-2.5" />
                                  {a.fileName}
                                </span>
                              ))}
                            </p>
                          )}

                          {e.defectLinks.length > 0 && (
                            <p className="text-[11px] text-rose-600">
                              {e.defectLinks.length} defect
                              {e.defectLinks.length === 1 ? "" : "s"} linked
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
