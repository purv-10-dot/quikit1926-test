"use client";

/**
 * New WWW — commitments made in THIS period that are not yet in the record.
 *
 * Deliberately a separate section from WWW Review. Review looks backwards at
 * items that already exist; this answers "did we capture what we just committed
 * to?". Merging them would blur exactly that question.
 *
 * NOTHING IS EVER CREATED AUTOMATICALLY
 * -------------------------------------
 * These are candidates. A human ticks them and presses Export, and only then
 * does a `WWWItem` exist. Auto-creation would fill the WWW module with items
 * nobody agreed to own, and a wrong item is far harder to remove than a missing
 * one is to add.
 *
 * GAPS ARE NAMED, NEVER FILLED
 * ----------------------------
 * A commitment with no stated date renders **"Not specified"** — not Friday,
 * not end-of-week. Inventing a due date is the failure the requirement document
 * calls out by name, so a row missing an owner or a date is shown as
 * incomplete and cannot be exported until a human supplies what is missing.
 *
 * Selection and export are owned by the parent, which knows the route to call;
 * this component renders and reports. `onSelectionChange` is optional so the
 * section can also be used read-only — in a downloaded report, for instance,
 * where a checkbox would be meaningless.
 */

import { Chip, EditableText, SectionCard } from "../reportUi";

export interface NewWwwRowView {
  factId?: string;
  whoRaw?: string | null;
  who?: { userId?: string | null; userName?: string | null; confidence?: string } | null;
  what?: string;
  whenText?: string | null;
  whenMissing?: boolean;
  missingFields?: ("who" | "what" | "when")[];
  confidence?: number;
  linkedWwwItemId?: string | null;
  dismissedAt?: string | Date | null;
}

/** The pre-`wwwReview` shape, still present on older stored reports. */
export interface LegacySuggestion {
  who?: string | null;
  what: string;
  when?: string | null;
  confidence: number;
}

export interface NewWwwSectionProps {
  title?: string;
  rows: NewWwwRowView[];
  legacySuggestions?: LegacySuggestion[];
  unavailableReason?: string | null;
  /** Ticked factIds. Omit to render read-only. */
  selected?: Set<string>;
  onSelectionChange?: (next: Set<string>) => void;
  /** Gaps remaining on a row AFTER the human's edits. */
  gapsFor?: (row: NewWwwRowView) => ("who" | "when" | "what")[];
  /** Inline gap-filling. Rendered only when supplied. */
  onDraftChange?: (factId: string, patch: { ownerId?: string; when?: string; dueDateTBD?: boolean }) => void;
  drafts?: Record<string, { ownerId?: string; when?: string; dueDateTBD?: boolean }>;
  /** Owner picker options. Without them the owner cell stays read-only. */
  ownerOptions?: { id: string; firstName: string; lastName: string; email: string }[];
  /** The action bar. Omitted entirely in a read-only render. */
  exportBar?: React.ReactNode;
  /**
   * Report-edit mode for the two fields the REPORT owns on these rows: the
   * commitment text and the date as spoken.
   *
   * Distinct from `onDraftChange` above, and the distinction matters. A draft
   * is export input — an owner id and a real due date used to CREATE a WWW
   * item, discarded if you never export. An edit changes what the report SAYS
   * this meeting committed to, and is persisted with the report.
   *
   * `who` is absent here on purpose: it is a resolution object carrying a user
   * id and a confidence, and export refuses to create work for an owner who
   * only needs confirmation. Confirming an owner stays the draft picker.
   */
  edit?: {
    editing: boolean;
    onFieldChange: (index: number, field: "what" | "whenText", value: string) => void;
  };
}

const ownerLabel = (r: NewWwwRowView): string =>
  r.who?.userName?.trim() || r.whoRaw?.trim() || "";

export function NewWwwSection({
  title = "New WWW / Action Items",
  rows,
  legacySuggestions = [],
  unavailableReason,
  selected,
  onSelectionChange,
  gapsFor,
  onDraftChange,
  drafts,
  ownerOptions,
  exportBar,
  edit,
}: NewWwwSectionProps) {
  const interactive = Boolean(selected && onSelectionChange);
  const editable = Boolean(onDraftChange && ownerOptions);

  if (rows.length === 0 && legacySuggestions.length === 0) {
    return (
      <SectionCard title={title}>
        <p className="text-xs text-gray-500">
          {unavailableReason ?? "No new action items were identified in this period."}
        </p>
      </SectionCard>
    );
  }

  // A report generated before this section existed has only the old prose
  // suggestions. They are rendered read-only: they carry no factId, so there is
  // nothing to export against — regenerating the report fills them in properly.
  if (rows.length === 0) {
    return (
      <SectionCard
        title={title}
        subtitle={`${legacySuggestions.length} suggestion${legacySuggestions.length === 1 ? "" : "s"}`}
      >
        <p className="mb-2 text-[11px] text-gray-500">
          These came from an earlier version of this report and cannot be exported.
          Regenerate to review and export them.
        </p>
        <ul className="space-y-1.5">
          {legacySuggestions.map((w, i) => (
            <li key={i} className="rounded-lg border border-gray-100 px-3 py-2 text-xs">
              <span className="font-medium text-gray-800">{w.what}</span>
              <span className="ml-2 text-[11px] text-gray-500">
                {w.who || "—"} ·{" "}
                {w.when ?? <em className="text-amber-700">not stated</em>}
              </span>
            </li>
          ))}
        </ul>
      </SectionCard>
    );
  }

  const live = rows.filter((r) => !r.dismissedAt && !r.linkedWwwItemId);
  const toggle = (factId: string) => {
    if (!selected || !onSelectionChange) return;
    const next = new Set(selected);
    if (next.has(factId)) next.delete(factId);
    else next.add(factId);
    onSelectionChange(next);
  };

  return (
    <SectionCard
      title={title}
      subtitle={`${live.length} candidate${live.length === 1 ? "" : "s"}`}
    >
      <p className="mb-2 text-[11px] text-gray-500">
        Nothing here exists yet. Tick the ones to keep and export them into the WWW
        module.
      </p>
      <div className="overflow-x-auto rounded-lg border border-gray-100">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="bg-accent-50">
              {interactive ? <th className="w-8 px-2 py-1.5" /> : null}
              {/* Wide enough that a full name is readable rather than clipped —
                  a truncated label is what made the old placeholder look like
                  a chosen owner. */}
              <th className="w-48 px-3 py-1.5 font-semibold text-gray-700">Who</th>
              <th className="px-3 py-1.5 font-semibold text-gray-700">What</th>
              <th className="px-3 py-1.5 font-semibold text-gray-700">When</th>
              <th className="px-3 py-1.5 font-semibold text-gray-700">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const key = r.factId ?? String(i);
              const created = Boolean(r.linkedWwwItemId);
              const dismissed = Boolean(r.dismissedAt);
              const draft = r.factId ? drafts?.[r.factId] : undefined;
              // Gaps AFTER the human's edits when the parent supplies the
              // calculation; the stored `missingFields` otherwise.
              const gaps = gapsFor ? gapsFor(r) : (r.missingFields ?? []);
              const incomplete = gaps.length > 0;
              const needsOwner = gaps.includes("who");
              const owner = ownerLabel(r);
              // The picker stays mounted once a human has picked, so the cell
              // keeps showing THEIR choice. Collapsing back to plain text the
              // moment the gap closes would redisplay the transcript's raw
              // name, and the user would read that as their selection being
              // thrown away and the suggestion reinstated.
              const showOwnerPicker =
                editable &&
                Boolean(r.factId) &&
                !created &&
                !dismissed &&
                (needsOwner || Boolean(draft?.ownerId));
              // A name-only match the bridge found but refused to assign. It is
              // offered as a pickable option, never as the resting value.
              const suggestedId = r.who?.confidence !== "RESOLVED" ? r.who?.userId : null;
              const suggestedUser = suggestedId
                ? ownerOptions?.find((u) => u.id === suggestedId)
                : undefined;
              const suggested = suggestedUser
                ? {
                    id: suggestedUser.id,
                    label:
                      [suggestedUser.firstName, suggestedUser.lastName].filter(Boolean).join(" ") ||
                      suggestedUser.email,
                  }
                : null;

              return (
                <tr
                  key={key}
                  className={`border-t border-gray-100 align-top ${
                    created || dismissed ? "opacity-60" : ""
                  }`}
                >
                  {interactive ? (
                    <td className="px-2 py-1.5">
                      <input
                        type="checkbox"
                        aria-label={`Select ${r.what ?? "candidate"}`}
                        className="text-blue-600"
                        disabled={created || dismissed}
                        checked={Boolean(r.factId && selected?.has(r.factId))}
                        onChange={() => r.factId && toggle(r.factId)}
                      />
                    </td>
                  ) : null}
                  <td className="px-3 py-1.5 text-gray-800">
                    {showOwnerPicker ? (
                      // Filled in by a human, never guessed. A name the bridge
                      // only half-matched is not good enough to assign work on.
                      //
                      // The empty option must NOT carry the suggested name: a
                      // closed select showing "Ashwin Singone" reads as a made
                      // selection, and the row then contradicts its own "Needs
                      // who" chip. The suggestion is offered as a real option
                      // instead, so taking it is a deliberate click.
                      <div className="space-y-1">
                        <select
                          aria-label={`Owner for ${r.what ?? "candidate"}`}
                          className={`w-full rounded border px-1.5 py-1 text-xs ${
                            needsOwner ? "border-amber-300" : "border-gray-300"
                          }`}
                          value={draft?.ownerId ?? ""}
                          onChange={(e) => onDraftChange!(r.factId!, { ownerId: e.target.value })}
                        >
                          <option value="">Select owner…</option>
                          {suggested ? (
                            <optgroup label="Suggested by the transcript">
                              <option value={suggested.id}>{suggested.label}</option>
                            </optgroup>
                          ) : null}
                          <optgroup label={suggested ? "All members" : "Members"}>
                            {ownerOptions!
                              .filter((u) => u.id !== suggested?.id)
                              .map((u) => (
                                <option key={u.id} value={u.id}>
                                  {[u.firstName, u.lastName].filter(Boolean).join(" ") || u.email}
                                </option>
                              ))}
                          </optgroup>
                        </select>
                        {/* Traceability without implying a selection. */}
                        {needsOwner && owner ? (
                          <p className="text-[10.5px] text-gray-500">
                            Transcript said “{owner}” — confirm the owner.
                          </p>
                        ) : null}
                      </div>
                    ) : owner ? (
                      owner
                    ) : (
                      <span className="text-amber-700" title="An owner is required before this can be created">
                        Not identified
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-gray-800">
                    <EditableText
                      value={r.what}
                      editing={Boolean(edit?.editing)}
                      multiline
                      ariaLabel={`Commitment ${i + 1}`}
                      onChange={(next) => edit?.onFieldChange(i, "what", next)}
                    />
                  </td>
                  <td className="px-3 py-1.5">
                    {r.whenMissing || !r.whenText ? (
                      editable && r.factId ? (
                        <div className="space-y-1">
                          <input
                            type="date"
                            aria-label={`Due date for ${r.what ?? "candidate"}`}
                            className="w-full rounded border border-amber-300 px-1.5 py-1 text-xs"
                            value={draft?.when ?? ""}
                            disabled={Boolean(draft?.dueDateTBD)}
                            onChange={(e) => onDraftChange!(r.factId!, { when: e.target.value })}
                          />
                          <label className="flex items-center gap-1 text-[10.5px] text-gray-600">
                            <input
                              type="checkbox"
                              className="text-blue-600"
                              checked={Boolean(draft?.dueDateTBD)}
                              onChange={(e) =>
                                onDraftChange!(r.factId!, { dueDateTBD: e.target.checked })
                              }
                            />
                            Due date TBD
                          </label>
                        </div>
                      ) : (
                        // The requirement doc's worked example: a commitment with
                        // no date stated must say so, never guess one.
                        <span className="text-amber-700">Not specified</span>
                      )
                    ) : edit?.editing ? (
                      /* The date AS SPOKEN — the report words, not a real due
                         date. The date picker above is export input and writes
                         a draft; this writes the report. */
                      <EditableText
                        value={r.whenText}
                        editing
                        ariaLabel={`When as spoken, row ${i + 1}`}
                        onChange={(next) => edit.onFieldChange(i, "whenText", next)}
                        className="text-gray-700"
                      />
                    ) : (
                      <span className="text-gray-700">{r.whenText}</span>
                    )}
                  </td>
                  <td className="px-3 py-1.5">
                    {created ? (
                      <Chip className="bg-green-50 text-green-700">Created</Chip>
                    ) : dismissed ? (
                      <Chip className="bg-gray-100 text-gray-500">Dismissed</Chip>
                    ) : incomplete ? (
                      <Chip className="bg-amber-50 text-amber-700">
                        Needs {gaps.join(" & ")}
                      </Chip>
                    ) : (
                      <Chip className="bg-blue-50 text-blue-700">Ready</Chip>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {exportBar}
    </SectionCard>
  );
}
