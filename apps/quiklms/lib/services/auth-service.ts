/**
 * Stub auth-service — replaces the old JWT-based auth service.
 * registerUser creates the LMS User row only (no auth/password of its own —
 * login is centralized via the ORG identity DB). It intentionally sends NO
 * email: the invitation/welcome email is dispatched centrally by
 * createCentralIdentity (see identity-service), which owns the temp password.
 */
import { db } from '@/lib/db';

export interface RegisterUserInput {
  /** When set, the LMS row is created with this id (e.g. the central User id). */
  id?: string;
  email: string;
  password?: string;
  firstName: string;
  lastName: string;
  role: string;
  orgId?: string;
  phone?: string;
  studentId?: string;
  guardianContact?: string;
  secondaryRole?: string;
  // Teacher fields
  subjects?: string[];
  ratePerClass?: number;
  rateType?: string;
  qualification?: string;
  monthlyPayout?: number;
  availableSlots?: unknown[];
  // Student/parent fields
  grade?: string;
  section?: string;
  parentEmail?: string;
  parentId?: string;
  guardianRelation?: string;
  studentEmail?: string;
  skipEmail?: boolean;
  [key: string]: unknown;
}

export async function registerUser(input: RegisterUserInput): Promise<{ data: { id: string; employeeId?: string; [key: string]: unknown } }> {
  const { id, email, firstName, lastName, role, orgId, phone } = input;

  const existing = await db.lmsUser.findFirst({ where: { email: email.toLowerCase() } });
  if (existing) throw new Error(`User with email ${email} already exists`);

  const user = await db.lmsUser.create({
    data: {
      // Share the central User id when provided so SSO `session.user.id` maps
      // to this LMS row (see identity-service). Otherwise auto-generate.
      //
      // `authUserId` records the SAME central id explicitly. Today it mirrors
      // `id`, which is redundant by design — it makes the bridge a real,
      // constrained column (@@unique([orgId, authUserId])) instead of a naming
      // convention, and it is what a later phase will read once `id` stops
      // doubling as the central id. Written here, at the one place LMS rows are
      // created, so the column cannot drift out of date.
      //
      // Absent when no `id` was passed: that row has no central identity, and
      // NULL is the correct value for it — not a placeholder.
      ...(id ? { id, authUserId: id } : {}),
      email: email.toLowerCase(),
      // No password is written. `LmsUser.password` used to be filled with a
      // throwaway `stub:<random>` value purely to satisfy the column; the
      // column is now gone. Credentials live only on `auth.User`, owned by the
      // central auth service.
      firstName,
      lastName,
      role: role as never,
      orgId: orgId ?? null,
      phone: phone ?? null,
      studentId: input.studentId ?? null,
      guardianContact: input.guardianContact ?? null,
      grade: input.grade ?? null,
      section: input.section ?? null,
      secondaryRole: (input.secondaryRole as never) ?? null,
      isActive: true,
    },
  });

  return { data: { id: user.id, employeeId: user.employeeId ?? undefined } };
}
