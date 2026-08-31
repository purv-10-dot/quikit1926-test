/**
 * Agenda adherence — §5.2 of the requirement doc.
 *
 * Turns segment markers detected in the transcript into the report's coverage
 * table: Done / Partial / Not Done, and On Track / Rushed / Over-ran / Skipped.
 *
 * TWO SOURCES, AND THE HUMAN ONE WINS
 * -----------------------------------
 * `ClientWeeklyMeeting` already carries seven human-entered coverage flags. The
 * transcript now yields a second, independent reading. They will sometimes
 * disagree, and the resolution is not negotiable: **the human flag is
 * authoritative.** A facilitator who ticked "WWW: NO" knows something the
 * transcript may not — the segment may have been deferred in a side channel, or
 * covered so briefly the recorder missed it.
 *
 * A disagreement is not discarded, though. It is recorded on the row and raised
 * as a validation warning, because a systematic mismatch means either the
 * detection is wrong or the flags are being filled in carelessly — and both are
 * worth knowing.
 *
 * TIME DISCIPLINE NEEDS AN EXPECTED DURATION
 * ------------------------------------------
 * "Rushed" and "Over-ran" are meaningless without one, which is why
 * `agendaConfig.ts` exists. Where no expected duration is known the verdict is
 * `UNKNOWN` rather than a guess — the reference report's own K&P row reads
 * "Over-ran" only because a human knew the intended box.
 */

import {
  type AgendaSegment,
  humanFlagFor,
  humanTimeFor,
  type SegmentKey,
} from "./agendaConfig";

/** Was the segment covered? */
export type Coverage = "DONE" | "PARTIAL" | "NOT_DONE" | "UNKNOWN";

/** How was the time handled? */
export type TimeDiscipline = "ON_TRACK" | "RUSHED" | "OVER_RAN" | "SKIPPED" | "UNKNOWN";

/** Where a coverage verdict came from. */
export type CoverageSource = "HUMAN_FLAG" | "TRANSCRIPT" | "BOTH_AGREE" | "NONE";

/** A boundary the extractor found in the transcript. */
export interface SegmentMarker {
  segmentKey: string;
  boundary: "START" | "END";
  atMs: number;
  confidence?: number;
}

export interface SegmentAdherenceRow {
  key: SegmentKey;
  label: string;
  order: number;
  coverage: Coverage;
  coverageSource: CoverageSource;
  timeDiscipline: TimeDiscipline;
  expectedMinutes: number;
  /** Derived from the transcript's markers. Null when the segment never began. */
  actualMinutes: number | null;
  startMs: number | null;
  endMs: number | null;
  /** "1:23:45 – 1:41:02", for the report's window column. */
  window: string | null;
  humanFlag: "YES" | "NO" | "NA" | null;
  humanTime: string | null;
  /** True when the human flag and the transcript reading disagree. */
  flagDisagrees: boolean;
  /** Short factual note for the report's comment column. */
  comment: string | null;
}

export interface SegmentAdherenceResult {
  rows: SegmentAdherenceRow[];
  summary: {
    done: number;
    partial: number;
    notDone: number;
    unknown: number;
    overRan: number;
    rushed: number;
    skipped: number;
    /** Segments where the human flag and the transcript disagree. */
    disagreements: number;
    expectedMinutesTotal: number;
    actualMinutesTotal: number | null;
  };
}

/**
 * A segment shorter than this share of its expected box was rushed; longer than
 * the over-run share, it over-ran.
 *
 * Deliberately wide. A 30-minute box finished in 22 minutes is a well-run
 * segment, not a rushed one, and flagging it would make the report nag about
 * efficiency. Only a genuine squeeze — under half the intended time — reads as
 * rushed.
 */
export const RUSHED_RATIO = 0.5;
export const OVER_RAN_RATIO = 1.25;

/** Segments under this many minutes are too short to judge either way. */
const MIN_JUDGEABLE_MINUTES = 1;

function hhmmss(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

/**
 * Reconstruct each segment's window from the markers.
 *
 * A START with no matching END runs to the next segment's START, or to the end
 * of the meeting — that is what a real agenda does, and requiring a paired END
 * would leave the last segment of every meeting unmeasured.
 */
function windowsFromMarkers(
  markers: SegmentMarker[],
  meetingEndMs: number | null,
): Map<string, { startMs: number; endMs: number | null }> {
  const starts = markers
    .filter((m) => m.boundary === "START")
    .sort((a, b) => a.atMs - b.atMs);
  const ends = markers.filter((m) => m.boundary === "END");

  const out = new Map<string, { startMs: number; endMs: number | null }>();

  starts.forEach((start, i) => {
    // An explicit END for this segment wins; otherwise the next segment's start.
    const explicitEnd = ends
      .filter((e) => e.segmentKey === start.segmentKey && e.atMs > start.atMs)
      .sort((a, b) => a.atMs - b.atMs)[0];

    const nextStart = starts[i + 1]?.atMs ?? null;
    const endMs = explicitEnd?.atMs ?? nextStart ?? meetingEndMs;

    // A segment discussed more than once keeps its FIRST window: the report
    // asks when a segment was covered, and a later aside is not a second run.
    if (!out.has(start.segmentKey)) {
      out.set(start.segmentKey, { startMs: start.atMs, endMs });
    }
  });

  return out;
}

/**
 * Classify time discipline.
 *
 * Returns UNKNOWN rather than guessing when there is no expected duration or no
 * measured one — "we don't know" and "on track" are different claims, and §5.2
 * must not report the second when it means the first.
 */
export function classifyTimeDiscipline(
  actualMinutes: number | null,
  expectedMinutes: number,
  coverage: Coverage,
): TimeDiscipline {
  if (coverage === "NOT_DONE") return "SKIPPED";
  if (actualMinutes === null || expectedMinutes <= 0) return "UNKNOWN";
  if (actualMinutes < MIN_JUDGEABLE_MINUTES) return "RUSHED";

  const ratio = actualMinutes / expectedMinutes;
  if (ratio >= OVER_RAN_RATIO) return "OVER_RAN";
  if (ratio <= RUSHED_RATIO) return "RUSHED";
  return "ON_TRACK";
}

/**
 * Reconcile the human flag with the transcript reading.
 *
 * The human flag wins on disagreement — a facilitator who ticked "NO" may know
 * the segment was deferred in a side channel the recorder never heard. The
 * disagreement is reported, not swallowed.
 */
function reconcileCoverage(
  humanFlag: "YES" | "NO" | "NA" | null,
  transcriptSaw: boolean,
  transcriptPartial: boolean,
): { coverage: Coverage; source: CoverageSource; disagrees: boolean } {
  const fromTranscript: Coverage = transcriptSaw
    ? transcriptPartial
      ? "PARTIAL"
      : "DONE"
    : "NOT_DONE";

  if (humanFlag === null) {
    return {
      coverage: transcriptSaw ? fromTranscript : "UNKNOWN",
      source: transcriptSaw ? "TRANSCRIPT" : "NONE",
      disagrees: false,
    };
  }

  // NA is a real answer — "this segment does not apply to this meeting" — and
  // is not a disagreement with a transcript that saw nothing.
  if (humanFlag === "NA") {
    return { coverage: "NOT_DONE", source: "HUMAN_FLAG", disagrees: transcriptSaw };
  }

  const fromHuman: Coverage = humanFlag === "YES" ? "DONE" : "NOT_DONE";
  const disagrees =
    (fromHuman === "DONE" && !transcriptSaw) || (fromHuman === "NOT_DONE" && transcriptSaw);

  return {
    coverage: fromHuman,
    source: disagrees ? "HUMAN_FLAG" : "BOTH_AGREE",
    disagrees,
  };
}

export interface SegmentAdherenceInput {
  agenda: AgendaSegment[];
  markers: SegmentMarker[];
  /** The `ClientWeeklyMeeting` row, for the human flags and times. */
  meeting: Record<string, unknown> | null;
  /** Meeting end, so the final segment can be measured. */
  meetingEndMs?: number | null;
  /**
   * Segments the extractor judged only partially covered — started but not
   * completed. Comes from the extraction, not from timing.
   */
  partialKeys?: string[];
}

/** Build the §5.2 coverage table. */
export function buildSegmentAdherence(
  input: SegmentAdherenceInput,
): SegmentAdherenceResult {
  const windows = windowsFromMarkers(input.markers, input.meetingEndMs ?? null);
  const partial = new Set(input.partialKeys ?? []);

  const rows: SegmentAdherenceRow[] = input.agenda.map((segment) => {
    const w = windows.get(segment.key) ?? null;
    const humanFlag = humanFlagFor(segment, input.meeting);
    const humanTime = humanTimeFor(segment, input.meeting);

    const actualMinutes =
      w && w.endMs !== null && w.endMs > w.startMs
        ? Math.round(((w.endMs - w.startMs) / 60_000) * 10) / 10
        : null;

    const { coverage, source, disagrees } = reconcileCoverage(
      humanFlag,
      w !== null,
      partial.has(segment.key),
    );

    const timeDiscipline = classifyTimeDiscipline(
      actualMinutes,
      segment.expectedMinutes,
      coverage,
    );

    return {
      key: segment.key,
      label: segment.label,
      order: segment.order,
      coverage,
      coverageSource: source,
      timeDiscipline,
      expectedMinutes: segment.expectedMinutes,
      actualMinutes,
      startMs: w?.startMs ?? null,
      endMs: w?.endMs ?? null,
      window: w ? `${hhmmss(w.startMs)}–${w.endMs !== null ? hhmmss(w.endMs) : "?"}` : null,
      humanFlag,
      humanTime,
      flagDisagrees: disagrees,
      comment: commentFor({ segment, coverage, timeDiscipline, actualMinutes, disagrees }),
    };
  });

  const count = (fn: (r: SegmentAdherenceRow) => boolean) => rows.filter(fn).length;
  const measured = rows
    .map((r) => r.actualMinutes)
    .filter((n): n is number => n !== null);

  return {
    rows: rows.sort((a, b) => a.order - b.order),
    summary: {
      done: count((r) => r.coverage === "DONE"),
      partial: count((r) => r.coverage === "PARTIAL"),
      notDone: count((r) => r.coverage === "NOT_DONE"),
      unknown: count((r) => r.coverage === "UNKNOWN"),
      overRan: count((r) => r.timeDiscipline === "OVER_RAN"),
      rushed: count((r) => r.timeDiscipline === "RUSHED"),
      skipped: count((r) => r.timeDiscipline === "SKIPPED"),
      disagreements: count((r) => r.flagDisagrees),
      expectedMinutesTotal: input.agenda.reduce((n, s) => n + s.expectedMinutes, 0),
      actualMinutesTotal:
        measured.length > 0
          ? Math.round(measured.reduce((a, b) => a + b, 0) * 10) / 10
          : null,
    },
  };
}

/**
 * A short factual note for the report's comment column.
 *
 * Strictly descriptive — "over-ran by 41 minutes", never "the chair lost
 * control". The requirement doc forbids inferring intent, and a comment column
 * is exactly where that would creep in.
 */
function commentFor(input: {
  segment: AgendaSegment;
  coverage: Coverage;
  timeDiscipline: TimeDiscipline;
  actualMinutes: number | null;
  disagrees: boolean;
}): string | null {
  const { segment, coverage, timeDiscipline, actualMinutes, disagrees } = input;

  if (disagrees) {
    return "The facilitator's flag and the recording disagree — the flag is used.";
  }
  if (coverage === "NOT_DONE") return `${segment.label} was not covered.`;
  if (coverage === "UNKNOWN") return "No coverage signal for this segment.";

  if (timeDiscipline === "OVER_RAN" && actualMinutes !== null) {
    const over = Math.round(actualMinutes - segment.expectedMinutes);
    return `Over-ran by about ${over} minute${over === 1 ? "" : "s"}.`;
  }
  if (timeDiscipline === "RUSHED" && actualMinutes !== null) {
    return `Covered in about ${Math.round(actualMinutes)} of ${segment.expectedMinutes} minutes.`;
  }
  return null;
}
