"use client";

/**
 * Unmapped speakers — the one place a human answers "who is this?".
 *
 * WHY IT EXISTS
 * -------------
 * `participantMatch.ts` will not act on a fuzzy name match by itself: a
 * near-miss comes back `pendingConfirm` and resolves to nobody, because guessing
 * between two similar names is how one person's blocker gets attributed to
 * another. Correct — but for a long time there was no way to answer the
 * question. A transcript that spelled "Ashwin Signone" as "Ashwin Singone"
 * matched at 0.976 confidence, was withheld, and became a permanent phantom row
 * in every weekly report.
 *
 * This tray shows what the matcher already worked out — the name it heard, how
 * many days it heard it, who it thinks that is and how sure it is — and turns
 * accepting it into one click. The answer is stored as a `ClientMemberAlias`, so
 * it is rung 3 (an exact lookup) from then on, for every future week.
 *
 * WHAT IT DELIBERATELY DOES NOT DO
 * --------------------------------
 * Regenerate. Saving an alias changes the roster hash, which flags the stored
 * report stale and surfaces the existing Regenerate banner — the facilitator
 * chooses when to spend an AI call, because regenerating can clear a completed
 * sign-off.
 */

import { useMemo, useState } from "react";
import type { UnmappedSpeaker } from "@/lib/services/unmappedSpeakers";

export interface RosterOption {
  id: string;
  name: string;
  email?: string | null;
}

/**
 * A name that resolved to nobody is one of two very different problems, and the
 * fix differs: a misspelling of somebody already on the roster needs mapping, a
 * genuinely new person needs adding. Telling them apart is what the suggestion
 * is for — so the copy keys off it rather than lumping both together.
 */
function reasonCopy(s: UnmappedSpeaker): string {
  if (s.suggestion) {
    return `Looks like a spelling variant of ${s.suggestion.memberName}`;
  }
  if (s.reason === "ambiguous") {
    return `Could be more than one member${s.candidates.length ? `: ${s.candidates.join(", ")}` : ""} — pick the right one`;
  }
  return "No match on this client's roster — map them, or add them in Client Members";
}

export function UnmappedSpeakersTray({
  speakers,
  roster,
  canEdit,
  onMapped,
}: {
  speakers: UnmappedSpeaker[];
  /** This client's team, for the picker. */
  roster: RosterOption[];
  /** `ClientMember: update` — the same gate the alias route enforces. */
  canEdit: boolean;
  /** Called after a successful mapping so the caller can reload the week. */
  onMapped: (message: string) => void;
}) {
  // memberId chosen per speaker, keyed by the heard name. Seeded from the
  // suggestion so the common case is a single click.
  const [choice, setChoice] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Rows answered in this session — hidden until the caller reloads. */
  const [done, setDone] = useState<Set<string>>(new Set());
  /** Rows the user said are not team members. Session-only, nothing persisted. */
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  const visible = useMemo(
    () => speakers.filter((s) => !done.has(s.name) && !dismissed.has(s.name)),
    [speakers, done, dismissed],
  );

  if (!visible.length) return null;

  const map = async (s: UnmappedSpeaker) => {
    const memberId = choice[s.name] ?? s.suggestion?.memberId ?? "";
    if (!memberId) {
      setError(`Choose who "${s.name}" is first.`);
      return;
    }
    setBusy(s.name);
    setError(null);
    try {
      const res = await fetch("/api/client-meetings/members/aliases", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientMemberId: memberId,
          alias: s.name,
          // "ai" when the matcher's own proposal was accepted unchanged, so the
          // suggestion quality stays auditable later.
          source: memberId === s.suggestion?.memberId ? "ai" : "manual",
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error ?? "Could not save the mapping");

      const name = roster.find((m) => m.id === memberId)?.name ?? "the member";
      setDone((prev) => new Set(prev).add(s.name));
      onMapped(`"${s.name}" is now recognised as ${name}. Regenerate the report to apply it.`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-lg border border-amber-200 bg-amber-50/60 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-amber-900">
            Unmapped speakers ({visible.length})
          </h3>
          <p className="mt-0.5 text-[11px] text-amber-800">
            These names were heard in the recordings but matched nobody on this client&apos;s
            roster, so they are shown separately and are not scored. Mapping a name is remembered
            for every future report.
          </p>
        </div>
      </div>

      {error ? (
        <p className="mt-2 rounded border border-red-200 bg-red-50 px-2 py-1 text-[11px] text-red-700">
          {error}
        </p>
      ) : null}

      <ul className="mt-3 space-y-2">
        {visible.map((s) => {
          const selected = choice[s.name] ?? s.suggestion?.memberId ?? "";
          return (
            <li
              key={s.name}
              className="flex flex-wrap items-center gap-2 rounded-md border border-amber-200 bg-white px-3 py-2"
            >
              <div className="min-w-[180px] flex-1">
                <p className="text-xs font-medium text-gray-900">
                  {s.name}
                  {s.email ? (
                    <span className="ml-1 font-normal text-gray-400">{s.email}</span>
                  ) : null}
                </p>
                <p className="text-[11px] text-gray-500">
                  {reasonCopy(s)} · heard on {s.daysHeard} {s.daysHeard === 1 ? "day" : "days"}
                  {s.suggestion ? (
                    <>
                      {" · "}
                      <span className="font-medium text-amber-700">
                        {Math.round(s.suggestion.confidence * 100)}% match
                      </span>
                    </>
                  ) : null}
                </p>
              </div>

              {canEdit ? (
                <>
                  <select
                    aria-label={`Map ${s.name} to a member`}
                    className="rounded border border-gray-300 px-2 py-1 text-xs focus:ring-2 focus:ring-accent-400"
                    value={selected}
                    onChange={(e) => setChoice((prev) => ({ ...prev, [s.name]: e.target.value }))}
                  >
                    <option value="">Select member…</option>
                    {roster.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={busy === s.name || !selected}
                    onClick={() => void map(s)}
                    className="rounded bg-accent-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-accent-700 disabled:opacity-50"
                  >
                    {busy === s.name ? "Saving…" : "This is them"}
                  </button>
                  <button
                    type="button"
                    disabled={busy === s.name}
                    onClick={() => setDismissed((prev) => new Set(prev).add(s.name))}
                    className="rounded border border-gray-300 px-2.5 py-1 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                    title="Hide this row for now. Nothing is saved — a guest or an outsider stays unmapped, which is the correct record."
                  >
                    Not a team member
                  </button>
                </>
              ) : (
                <span className="text-[11px] italic text-gray-400">
                  You do not have permission to map members
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
