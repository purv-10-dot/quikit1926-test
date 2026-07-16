/**
 * Stub auth-service — replaces the old JWT-based auth service.
 * registerUser creates the LMS User row only (no auth/password of its own —
 * login is centralized via the ORG identity DB). It intentionally sends NO
 * email: the invitation/welcome email is dispatched centrally by
 * createCentralIdentity (see identity-service), which owns the temp password.
 */
import { randomBytes } from 'crypto';
import { prisma } from '@/lib/prisma';

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

  const existing = await prisma.lmsUser.findFirst({ where: { email: email.toLowerCase() } });
  if (existing) throw new Error(`User with email ${email} already exists`);

  const pwd = input.password ?? randomBytes(16).toString('hex');

  const user = await prisma.lmsUser.create({
    data: {
      // Share the central User id when provided so SSO `session.user.id` maps
      // to this LMS row (see identity-service). Otherwise auto-generate.
      ...(id ? { id } : {}),
      email: email.toLowerCase(),
      password: `stub:${pwd}`,
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
