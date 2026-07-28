/**
 * Atomic proctoring-flag increments.
 *
 * WHY RAW SQL. Mongo incremented these counters with `$inc`
 * (`proctoring.service.ts:47-51`, `quiz-proctoring.service.ts:465-471`), which
 * is atomic per-field. Both ports replaced it with read-modify-write on a JSON
 * blob: read `proctoringFlags`, mutate in JS, write the whole object back.
 *
 * Proctoring events arrive in BURSTS — a single alt-tab emits several within
 * milliseconds — so interleaved RMW cycles lose increments, and because the
 * entire blob is rewritten the loser clobbers *every* counter, not just its own.
 * A student who tab-switched 12 times could show 4 flags, and `severityLevel`
 * would land on `low` instead of `high`. That is under-reported cheating in the
 * one subsystem whose whole purpose is to report it.
 *
 * `jsonb_set` on a single UPDATE statement restores the atomicity Mongo had.
 * Field names come from a fixed internal map, never from user input, and are
 * additionally allow-listed here before interpolation.
 */
import { db } from '@/lib/db';

/**
 * Every counter key either service may increment. Guards the SQL interpolation.
 *
 * This MUST be the union of the `FLAG_FIELD_MAP` VALUES in
 * `proctoring-service.ts` (exam) and `quiz-proctoring-service.ts` (quiz), plus
 * `totalFlags`. A name here that no map emits is dead; a name a map emits that
 * is missing here silently drops the event — `incrementProctoringFlags`
 * early-returns, so neither the counter NOR `totalFlags` moves.
 *
 * That is exactly what happened to face proctoring: this list carried
 * `faceNotDetected` / `multipleFaces` (plus `noiseDetected`, `devToolsOpened`,
 * `windowResizes`, `idleWarnings`, `networkDrops` — names nothing in this repo
 * or the legacy Mongo backend ever emitted or read), while the quiz service
 * emits `faceNoFace` / `faceMultiple` / `faceLookingAway` / `faceLookingDown` /
 * `faceEyesClosed` / `faceTooFar`. None matched, so every face violation was
 * discarded: a face-only session kept `totalFlags: 0` and therefore never
 * surfaced in `getAssessmentIncidents` / `getAllIncidents` (both filter
 * `totalFlags > 0`) and the admin review chips all read 0.
 *
 * The emitted `face*` names are also what the legacy Mongo schema stored
 * (`quiz-proctoring-session.schema.ts`) and what the review page reads, so the
 * allow-list is widened to them rather than the emitter being renamed — stored
 * rows already use these keys.
 *
 * Keep this a fixed list of literal field names. It is the only thing standing
 * between `$executeRawUnsafe` and injection through the `{${field}}` path.
 */
const ALLOWED_FLAG_FIELDS = new Set([
  // DOM-event counters — emitted by BOTH services.
  'tabSwitches',
  'fullscreenExits',
  'copyAttempts',
  'rightClicks',
  'shortcutAttempts',
  // Face counters — emitted by the quiz service only (MediaPipe hook).
  'faceNoFace',
  'faceMultiple',
  'faceLookingAway',
  'faceLookingDown',
  'faceEyesClosed',
  'faceTooFar',
  // Aggregate. `face_camera_error` maps straight to this (bump once, not twice).
  'totalFlags',
]);

type FlagTable = 'exam_sessions' | 'quiz_proctoring_sessions';

/**
 * Atomically `+1` the named counter and `totalFlags`, and set `severityLevel`.
 *
 * When `field === 'totalFlags'` the counter is incremented ONCE, not twice.
 * Mongo's `$inc` object had a duplicate key in that case
 * (`FLAG_FIELD_MAP['face_camera_error'] === 'totalFlags'`), which collapses to a
 * single increment; the port's two sequential statements made it +2, so every
 * camera error double-counted and a flaky webcam inflated a student's flag total.
 */
export async function incrementProctoringFlags(
  table: FlagTable,
  sessionId: string,
  field: string,
  severityLevel: string,
): Promise<void> {
  if (!ALLOWED_FLAG_FIELDS.has(field)) return;

  const bumpTotalOnly = field === 'totalFlags';

  // Build the nested jsonb_set. Identifiers are constants; values are bound.
  const setTotal = `jsonb_set(base, '{totalFlags}', to_jsonb(COALESCE((base->>'totalFlags')::int, 0) + 1))`;
  const inner = bumpTotalOnly
    ? setTotal
    : `jsonb_set(${setTotal}, '{${field}}', to_jsonb(COALESCE((base->>'${field}')::int, 0) + 1))`;

  await db.$executeRawUnsafe(
    `UPDATE "app_quiklms"."${table}" AS t
     SET "proctoringFlags" = jsonb_set(${inner}, '{severityLevel}', to_jsonb($2::text))
     FROM (
       SELECT COALESCE("proctoringFlags", '{}'::jsonb) AS base, id
       FROM "app_quiklms"."${table}"
       WHERE id = $1
     ) AS s
     WHERE t.id = s.id`,
    sessionId,
    severityLevel,
  );
}
