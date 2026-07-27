/**
 * Roster enrichment — the LMS-side writes that `registerUser` does not make.
 *
 * `registerUser` writes a FIXED column subset (name, email, role, orgId, phone,
 * studentId, guardianContact, grade, section, secondaryRole). Everything else a
 * roster form collects — a teacher's subjects, pay rate, qualification and
 * weekly availability, and the per-tenant roll number — has to be written
 * afterwards, against LMS tables only, so the off-limits auth/identity path is
 * consumed exactly as-is.
 *
 * WHY THIS IS SHARED. These two helpers lived inside `bulk-upload-service`, so
 * only CSV import ran them. The single-person roster forms
 * (`POST /api/auth/register`) did not, which meant a teacher added through the
 * UI was created with no subjects, no rate, no employee id and — the one that
 * breaks a whole flow — NO AVAILABILITY SLOTS.
 *
 * That last one is not cosmetic. `validateTeacherSchedule` (scheduling-service)
 * hard-fails a teacher with zero slots:
 *
 *   "Teacher has no availability slots defined. Please set the teacher's weekly
 *    availability before assigning to a batch."
 *
 * and `batches-service.create` calls it on every batch that has a schedule —
 * which the batch form requires (`schedule: z.array(...).min(1)`). So a teacher
 * created from the Teachers page could be picked in the batch form and then
 * never actually saved into a batch, while the same teacher imported from a CSV
 * worked. The form was collecting availability and silently discarding it.
 */
import { z } from 'zod';
import { db } from '@/lib/db';
import { getNextId } from './counters';

export interface AvailabilitySlotInput {
  dayOfWeek: number;
  startTime: string;
  endTime: string;
}

/**
 * Availability arrives as `unknown[]` (RegisterUserInput types it loosely, and
 * the CSV importer builds it by hand), and every element becomes a database row
 * that the scheduler later compares as `HH:MM` strings. A malformed slot would
 * either blow up in Postgres or, worse, silently never match a lesson time — so
 * anything that is not a well-formed slot is DROPPED rather than written.
 */
const slotSchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
  endTime: z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/),
});

export function normalizeAvailabilitySlots(input: unknown): AvailabilitySlotInput[] {
  if (!Array.isArray(input)) return [];
  const parsed = input.map((s) => slotSchema.safeParse(s));
  const kept = parsed.flatMap((r) => (r.success ? [r.data] : []));
  if (kept.length !== parsed.length) {
    // eslint-disable-next-line no-console
    console.warn(`[roster] dropped ${parsed.length - kept.length} malformed availability slot(s)`);
  }
  // A slot whose end is not after its start can never match anything.
  return kept.filter((s) => s.startTime < s.endTime);
}

/** Narrow one loosely-typed body field to a string, or undefined. */
function asString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Narrow one loosely-typed body field to a finite number, or undefined. */
function asNumber(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

export interface TeacherProfileFields {
  subjects?: string[];
  ratePerClass?: number;
  rateType?: string;
  qualification?: string;
  monthlyPayout?: number;
  availableSlots?: AvailabilitySlotInput[];
}

/** Mint and persist the per-tenant roll number (SCH-T-0001 / SCH-S-0001 / SCH-P-0001). */
export async function assignGeneratedId(
  userId: string,
  orgId: string,
  type: 'teacher' | 'student' | 'parent',
): Promise<string | undefined> {
  try {
    const code = await getNextId(orgId, type);
    const field = type === 'teacher' ? 'employeeId' : type === 'student' ? 'studentId' : 'parentCode';
    await db.lmsUser.update({ where: { id: userId }, data: { [field]: code } });
    return code;
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error(`[roster] failed to assign ${type} id for ${userId}:`, err);
    return undefined;
  }
}

/**
 * Write the teacher-only columns plus the availability slots (an embedded array
 * in Mongo, the `LmsUserAvailabilitySlot` relation here).
 *
 * Only fields that were actually supplied are written, so this is safe to call
 * on a payload that carries none of them.
 */
export async function applyTeacherProfile(userId: string, fields: TeacherProfileFields): Promise<void> {
  const data: Record<string, unknown> = {};
  if (fields.subjects?.length) data.subjects = fields.subjects;
  if (fields.ratePerClass !== undefined && !Number.isNaN(fields.ratePerClass)) data.ratePerClass = fields.ratePerClass;
  if (fields.rateType) data.rateType = fields.rateType;
  if (fields.qualification) data.qualification = fields.qualification;
  if (fields.monthlyPayout !== undefined && !Number.isNaN(fields.monthlyPayout)) data.monthlyPayout = fields.monthlyPayout;

  if (Object.keys(data).length) {
    await db.lmsUser.update({ where: { id: userId }, data });
  }
  if (fields.availableSlots?.length) {
    await db.lmsUserAvailabilitySlot.createMany({
      data: fields.availableSlots.map((s) => ({
        userId,
        dayOfWeek: s.dayOfWeek,
        startTime: s.startTime,
        endTime: s.endTime,
      })),
      skipDuplicates: true,
    });
  }
}

/** The roll-number kind for an LMS role, or null for roles that do not get one. */
function generatedIdKind(lmsRole: string): 'teacher' | 'student' | 'parent' | null {
  if (lmsRole === 'TEACHER') return 'teacher';
  if (lmsRole === 'LEARNER') return 'student';
  if (lmsRole === 'PARENT') return 'parent';
  return null;
}

/**
 * Everything the roster has to do to a freshly-provisioned user beyond the
 * columns `registerUser` writes. Best-effort by design: the person already
 * exists and is usable, so a failure here is logged, never thrown — losing the
 * whole account because a counter row was locked would be worse than a missing
 * roll number, which an admin can fill in later.
 *
 * Returns the generated roll number when one was minted.
 */
export async function enrichRosterUser(
  userId: string,
  orgId: string,
  lmsRole: string,
  /** The raw request body — every field is narrowed here, nothing is trusted. */
  body: Record<string, unknown>,
): Promise<{ generatedId?: string }> {
  if (lmsRole === 'TEACHER') {
    try {
      await applyTeacherProfile(userId, {
        subjects: Array.isArray(body.subjects)
          ? body.subjects.flatMap((s) => (asString(s) ? [asString(s) as string] : []))
          : undefined,
        ratePerClass: asNumber(body.ratePerClass),
        rateType: asString(body.rateType),
        qualification: asString(body.qualification),
        monthlyPayout: asNumber(body.monthlyPayout),
        availableSlots: normalizeAvailabilitySlots(body.availableSlots),
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`[roster] failed to apply teacher profile for ${userId}:`, err);
    }
  }

  const kind = generatedIdKind(lmsRole);
  if (!kind) return {};

  // An explicitly supplied id wins — the admin typed it, so do not overwrite it
  // with a generated one.
  const supplied = asString(
    kind === 'teacher' ? body.employeeId : kind === 'student' ? body.studentId : body.parentCode,
  );
  if (supplied) return { generatedId: supplied };

  return { generatedId: await assignGeneratedId(userId, orgId, kind) };
}
