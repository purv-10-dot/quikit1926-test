/**
 * Shared "activity timeline" building blocks — used by both the per-
 * requisition Timeline (requisitions/[id]/timeline) and the per-recruiter
 * Activity view (recruiters/[id]/activity). A requisition/recruiter's
 * history is a mix of:
 *   - single, requisition-level events (created, edited, status change,
 *     approve/reject, date revision, SLA override, recruiter assignment)
 *   - candidate-level events that happen to MANY candidates on the same day
 *     (5 candidates screened on the 24th, 3 interviews on the 1st, etc.) —
 *     these get grouped so the timeline reads like a daily activity summary
 *     instead of one line per candidate.
 */

export type ActivityKind =
  | "Created" | "Updated" | "StatusChanged" | "DateRevised" | "SlaOverrideChanged"
  | "RecruiterAssigned" | "Approved" | "Rejected"
  | "ApplicationReceived" | "StageChanged" | "InterviewScheduled" | "OfferSent" | "Hired";

export interface RawActivityEvent {
  kind: ActivityKind;
  at: Date;
  /** Requisition-level single events carry their own title/description directly. */
  title?: string;
  description?: string | null;
  actor?: { id: string; name: string; jobTitle?: string | null } | null;
  /** Candidate-centric groupable events carry these instead of title/description. */
  candidateName?: string;
  /** Separates e.g. a "Screening" move from an "Offer" move on the same day. */
  groupKey?: string;
  /** Shown alongside the candidate name when aggregating across multiple requisitions (recruiter view). */
  requisitionTitle?: string;
}

export interface GroupedActivityEntry {
  id: string;
  kind: ActivityKind;
  title: string;
  description?: string | null;
  names?: string[];
  actor?: { id: string; name: string; jobTitle?: string | null } | null;
  at: string;
}

const GROUPABLE = new Set<ActivityKind>(["ApplicationReceived", "StageChanged", "InterviewScheduled", "OfferSent", "Hired"]);

const KIND_VERB: Partial<Record<ActivityKind, { plural: string; singular: string }>> = {
  ApplicationReceived: { plural: "candidates applied", singular: "applied" },
  InterviewScheduled: { plural: "interviews scheduled", singular: "interview scheduled" },
  OfferSent: { plural: "offers sent", singular: "offer sent" },
  Hired: { plural: "candidates hired", singular: "hired" },
};

// Re-exported so existing importers keep working — the actual mapping lives
// in lib/services/pipeline-stages.ts, the SAME one the Hiring Pipeline board
// uses, so a stage name reads identically everywhere in the app.
export { prettyStage } from "@/lib/services/pipeline-stages";

function dateKey(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function displayName(e: RawActivityEvent): string {
  if (!e.candidateName) return "";
  return e.requisitionTitle ? `${e.candidateName} (${e.requisitionTitle})` : e.candidateName;
}

/** Groups same-day, same-kind candidate events into one summary entry; requisition-level events stay individual. */
export function groupActivityEvents(events: RawActivityEvent[]): GroupedActivityEntry[] {
  const out: GroupedActivityEntry[] = [];
  const groups = new Map<string, RawActivityEvent[]>();

  events.forEach((e, i) => {
    if (!GROUPABLE.has(e.kind)) {
      out.push({
        id: `single-${i}-${e.at.getTime()}`,
        kind: e.kind, title: e.title ?? e.kind, description: e.description ?? null,
        actor: e.actor ?? null, at: e.at.toISOString(),
      });
      return;
    }
    const key = `${e.kind}::${dateKey(e.at)}::${e.groupKey ?? ""}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(e);
  });

  for (const [key, list] of groups) {
    const [kindStr, , groupKeyPart] = key.split("::");
    const kind = kindStr as ActivityKind;
    const count = list.length;
    const latest = list.reduce((a, b) => (b.at > a.at ? b : a));
    const names = list.map(displayName).filter(Boolean);

    let title: string;
    if (kind === "StageChanged") {
      title = count === 1
        ? `${names[0] ?? "1 candidate"} moved to "${groupKeyPart}"`
        : `${count} candidates moved to "${groupKeyPart}"`;
    } else {
      const verb = KIND_VERB[kind];
      title = count === 1
        ? `${names[0] ?? "1"} ${verb?.singular ?? kind}`
        : `${count} ${verb?.plural ?? kind}`;
    }

    out.push({ id: `grp-${key}`, kind, title, names, at: latest.at.toISOString() });
  }

  out.sort((a, b) => new Date(a.at).getTime() - new Date(b.at).getTime());
  return out;
}
