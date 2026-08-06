/**
 * Users service — ported from UsersService (Prisma). Tenant scoping is applied
 * by callers via the orgId argument (SUPER_ADMIN passes undefined to span all).
 */
import type { Prisma, LmsUserRole as UserRole } from '@prisma/client';
import { LmsUserRole } from '@prisma/client';
import { db } from '@/lib/db';
import { BadRequest, Forbidden, NotFound } from '@/lib/http';
import { sendEmail } from '@/lib/email';

/** Every valid role, read from the generated enum so it cannot drift from the schema. */
const USER_ROLES = Object.values(LmsUserRole) as UserRole[];

const LIST_SELECT = {
  id: true, firstName: true, lastName: true, email: true, role: true, secondaryRole: true,
  profilePicture: true, grade: true, section: true, studentId: true, employeeId: true, parentCode: true,
  isActive: true, managerId: true, orgId: true, phone: true, subjects: true, createdAt: true,
} satisfies Prisma.LmsUserSelect;

function nameSearch(search: string): Prisma.LmsUserWhereInput {
  const words = search.trim().split(/\s+/).filter(Boolean);
  if (words.length === 1) {
    const w = words[0];
    return { OR: [
      { firstName: { contains: w, mode: 'insensitive' } },
      { lastName: { contains: w, mode: 'insensitive' } },
      { email: { contains: w, mode: 'insensitive' } },
    ] };
  }
  return {
    AND: words.map((w) => ({
      OR: [
        { firstName: { contains: w, mode: 'insensitive' } },
        { lastName: { contains: w, mode: 'insensitive' } },
        { email: { contains: w, mode: 'insensitive' } },
      ],
    })),
  };
}

const SEARCH_SELECT = {
  id: true, firstName: true, lastName: true, email: true, role: true, profilePicture: true, grade: true,
} satisfies Prisma.LmsUserSelect;

/**
 * Port of `UsersService.searchUsers` (`users.service.ts:40-119`).
 *
 * PRECEDENCE — `excludeRoles` OVERWRITES `role`; it is NOT a fallback. The
 * legacy assigns `baseFilter.role = role` and then unconditionally reassigns
 * `baseFilter.role = { $nin: excludeRoles }` when excludeRoles is non-empty
 * (`:48-53`), so the exclusion always wins.
 *
 * This is load-bearing, not a quirk. The caller passes
 * `excludeRoles = ['TEACHER','PARENT']` for corporate tenants
 * (`app/api/users/search/route.ts:29`), and the route has no role guard — it is
 * open to any authenticated user, matching the legacy. With an `else if`, any
 * LEARNER on a corporate tenant could enumerate hidden staff via
 * `?role=TEACHER`. Note this differs from `findAllUsers`, where the legacy DOES
 * use an else-if chain (`:130-141`) — the two are genuinely inconsistent
 * upstream, and both are reproduced as-is.
 *
 * RANKING — single-word queries return prefix matches FIRST (max 10), then
 * contains-matches excluding those (max 10). Every branch caps at 20.
 */
export async function searchUsers(orgId: string | undefined, query?: string, role?: string, excludeRoles: string[] = []) {
  const base: Prisma.LmsUserWhereInput = { isActive: true };
  if (orgId) base.orgId = orgId;
  if (role) base.role = role as UserRole;
  // Deliberate reassignment — see the precedence note above.
  if (excludeRoles.length) base.role = { notIn: excludeRoles as UserRole[] };

  const orderBy: Prisma.LmsUserOrderByWithRelationInput[] = [{ firstName: 'asc' }, { lastName: 'asc' }];
  const trimmed = query?.trim();

  if (!trimmed) {
    return db.lmsUser.findMany({ where: base, select: SEARCH_SELECT, orderBy, take: 20 });
  }

  const words = trimmed.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    const w = words[0];
    // Prefix matches first — the legacy ranked these above contains-matches so
    // typing "ada" surfaces Ada before Amadadu.
    const prefixMatches = await db.lmsUser.findMany({
      where: {
        ...base,
        OR: [
          { firstName: { startsWith: w, mode: 'insensitive' } },
          { lastName: { startsWith: w, mode: 'insensitive' } },
        ],
      },
      select: SEARCH_SELECT,
      orderBy,
      take: 10,
    });

    const containsMatches = await db.lmsUser.findMany({
      where: {
        ...base,
        id: { notIn: prefixMatches.map((u) => u.id) },
        OR: [
          { firstName: { contains: w, mode: 'insensitive' } },
          { lastName: { contains: w, mode: 'insensitive' } },
          { email: { contains: w, mode: 'insensitive' } },
        ],
      },
      select: SEARCH_SELECT,
      orderBy,
      take: 10,
    });

    return [...prefixMatches, ...containsMatches];
  }

  return db.lmsUser.findMany({
    where: { ...base, ...nameSearch(trimmed) },
    select: SEARCH_SELECT,
    orderBy,
    take: 20,
  });
}

export async function findAllUsers(orgId: string | undefined, search?: string, role?: string, excludeRoles: string[] = []) {
  const where: Prisma.LmsUserWhereInput = {};
  if (orgId) where.orgId = orgId;
  if (role === 'SUB_ADMIN') where.OR = [{ role: 'SUB_ADMIN' }, { secondaryRole: 'SUB_ADMIN' }];
  else if (role && role !== 'ALL') where.role = role as UserRole;
  else if (excludeRoles.length) where.role = { notIn: excludeRoles as UserRole[] };
  if (search?.trim()) Object.assign(where, nameSearch(search));
  return db.lmsUser.findMany({ where, select: LIST_SELECT, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] });
}

export async function findUsersByIds(orgId: string, ids: string[]) {
  if (!ids.length) return [];
  return db.lmsUser.findMany({
    where: { id: { in: ids }, orgId },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, grade: true, section: true, studentId: true },
  });
}

export async function promoteToSubAdmin(userId: string, orgId: string) {
  const user = await db.lmsUser.findUnique({ where: { id: userId } });
  if (!user) throw NotFound('User not found');
  if (!user.orgId || user.orgId !== orgId) throw Forbidden('User is not in this organization');
  if (user.secondaryRole === 'SUB_ADMIN') throw BadRequest('User already has Sub Admin role');
  return db.lmsUser.update({ where: { id: userId }, data: { secondaryRole: 'SUB_ADMIN' }, select: LIST_SELECT });
}

export async function revokeSubAdmin(userId: string, orgId: string) {
  const user = await db.lmsUser.findUnique({ where: { id: userId } });
  if (!user) throw NotFound('User not found');
  if (!user.orgId || user.orgId !== orgId) throw Forbidden('User is not in this organization');
  return db.lmsUser.update({ where: { id: userId }, data: { secondaryRole: null }, select: LIST_SELECT });
}

/**
 * Parent ↔ student links.
 *
 * The port READ these links from day one — parent access to
 * `/credits/my-transactions` and `/analytics/student/:id` is gated on
 * `lmsUserParent` — but shipped no endpoint that could CREATE or REMOVE one, so
 * the only way a link ever came into existence was bulk upload. A tenant admin
 * had no way to link a parent to a child, and no way to correct a wrong link.
 *
 * Ports `AuthService.linkParentStudent` / `unlinkParentStudent`
 * (`auth.service.ts:1196-1233`). Mongo stored this twice — `childrenIds` on the
 * parent and `parentIds` on the student, kept in step with `$addToSet`/`$pull`.
 * Postgres has one `LmsUserParent` row with `@@unique([parentId, childId])`, so
 * the pair IS the relationship and the two writes collapse into one. That also
 * removes the legacy's failure mode where one array could update and the other
 * not, leaving a half-link.
 *
 * Both sides are verified to exist, to be in the CALLER'S org, and to hold the
 * expected role — the legacy checked exactly this, and without it a tenant admin
 * could link users from another tenant.
 */
async function assertInOrg(userId: string, orgId: string, role: 'PARENT' | 'LEARNER', label: string) {
  const user = await db.lmsUser.findFirst({ where: { id: userId, orgId } });
  if (!user) throw NotFound(`${label} not found in this tenant`);
  // `secondaryRole` counts: the legacy's RolesGuard treated either as the role.
  if (user.role !== role && user.secondaryRole !== role) {
    throw BadRequest(`${label} does not have the ${role} role`);
  }
  return user;
}

export async function linkParentStudent(orgId: string, parentId: string, studentId: string) {
  await assertInOrg(parentId, orgId, 'PARENT', 'Parent');
  await assertInOrg(studentId, orgId, 'LEARNER', 'Student');

  const existing = await db.lmsUserParent.findUnique({
    where: { parentId_childId: { parentId, childId: studentId } },
  });
  // Legacy returned success without re-writing when already linked.
  if (existing) return { success: true, message: 'Already linked' };

  await db.lmsUserParent.create({ data: { parentId, childId: studentId } });
  return { success: true, message: 'Parent-Student linked successfully' };
}

export async function unlinkParentStudent(orgId: string, parentId: string, studentId: string) {
  // Scope the delete by org so an admin cannot sever a link in another tenant.
  // `deleteMany` (not `delete`) because the legacy's `$pull` was a no-op when
  // the link was already gone rather than an error.
  await assertInOrg(parentId, orgId, 'PARENT', 'Parent');
  await db.lmsUserParent.deleteMany({ where: { parentId, childId: studentId } });
  return { success: true, message: 'Parent-Student unlinked successfully' };
}

export async function toggleActive(id: string, orgId: string | undefined, isActive: boolean) {
  const where: Prisma.LmsUserWhereInput = { id };
  if (orgId) where.orgId = orgId;
  const existing = await db.lmsUser.findFirst({ where });
  if (!existing) throw NotFound('User not found');
  return db.lmsUser.update({ where: { id }, data: { isActive }, select: LIST_SELECT });
}

export async function updateUser(id: string, orgId: string | undefined, data: Record<string, unknown>) {
  const where: Prisma.LmsUserWhereInput = { id };
  if (orgId) where.orgId = orgId;
  const current = await db.lmsUser.findFirst({ where });
  if (!current) throw NotFound('User not found or access denied');

  const update: Prisma.LmsUserUpdateInput = {};
  const allowed = ['firstName', 'lastName', 'phone', 'grade', 'section', 'studentId', 'employeeId', 'subjects',
    'ratePerClass', 'ratePerHour', 'rateType', 'qualification', 'monthlyPayout', 'guardianContact', 'guardianRelation',
    'maxSlotsPerWeek', 'tutoringEnabled', 'tutoringCreditCost', 'dateOfBirth', 'managerId'];
  for (const k of allowed) if (data[k] !== undefined) (update as Record<string, unknown>)[k] = k === 'dateOfBirth' ? new Date(data[k] as string) : data[k];

  /**
   * role — legacy parity (`users.service.ts:305`, allowed by `update-user.dto.ts:38`).
   * This endpoint CAN change a user's privileges, and always could: the route
   * is guarded to SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN, matching the legacy's
   * `@Roles` on `@Patch(':id')` (`users.controller.ts:198-199`), and the actor's
   * org scope is already enforced by the `findFirst` above.
   *
   * Validated against the enum here rather than passed straight through: the
   * route body is `passthrough()`, so an unknown string would otherwise reach
   * Prisma and surface as a 500 instead of a 400.
   */
  if (data.role !== undefined) {
    const role = String(data.role);
    if (!USER_ROLES.includes(role as UserRole)) throw BadRequest(`Invalid role: ${role}`);
    update.role = role as UserRole;
  }

  /**
   * availableSlots — the legacy allowed it (`update-user.dto.ts:44-47`,
   * `users.service.ts:309`) and assigned the array wholesale, replacing the
   * embedded document. Dropping it from the allow-list was a capability
   * regression: teacher availability could not be edited at all.
   *
   * Mongo stored it embedded; Postgres models it as the `LmsUserAvailabilitySlot`
   * relation. `deleteMany + create` in one nested write is the faithful
   * equivalent of the wholesale replace — and it stays atomic with the rest of
   * the update, so a half-written schedule is impossible.
   */
  if (data.availableSlots !== undefined) {
    const slots = Array.isArray(data.availableSlots) ? data.availableSlots : [];
    update.availableSlots = {
      deleteMany: {},
      create: slots.map((s) => {
        const slot = s as { dayOfWeek?: unknown; startTime?: unknown; endTime?: unknown };
        return {
          dayOfWeek: Number(slot.dayOfWeek),
          startTime: String(slot.startTime),
          endTime: String(slot.endTime),
        };
      }),
    };
  }

  // Tracks a genuine sign-in-email change so we can send the address-update
  // welcome email after a successful write (legacy `emailChangedTo`).
  let emailChangedTo: string | null = null;
  if (data.email !== undefined) {
    const newEmail = String(data.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw BadRequest('A valid email address is required');
    if (newEmail !== current.email.toLowerCase()) {
      const dup = await db.lmsUser.findFirst({ where: { id: { not: id }, email: newEmail, orgId: current.orgId } });
      if (dup) throw BadRequest('Another user with this email already exists');
      update.email = newEmail;
      emailChangedTo = newEmail;
    }
  }

  /**
   * parentIds / childrenIds — legacy parity (`users.service.ts:319-329`), both
   * missing from the port's allow-list, so the parent↔child graph could not be
   * edited at all.
   *
   * Mongo stored these as embedded ObjectId arrays on the user. Postgres models
   * the graph as the `LmsUserParent` join table, seen from both directions:
   *   parentIds   → this user is the CHILD  → `parents`  (UserParents)
   *   childrenIds → this user is the PARENT → `children` (UserChildren)
   * `deleteMany + create` reproduces the legacy's wholesale array replace, and
   * `.filter(Boolean)` drops falsy entries exactly as the legacy did.
   */
  if (data.parentIds !== undefined) {
    const ids = (Array.isArray(data.parentIds) ? data.parentIds : []).filter(Boolean).map(String);
    update.parents = { deleteMany: {}, create: ids.map((parentId) => ({ parentId })) };
  }
  if (data.childrenIds !== undefined) {
    const ids = (Array.isArray(data.childrenIds) ? data.childrenIds : []).filter(Boolean).map(String);
    update.children = { deleteMany: {}, create: ids.map((childId) => ({ childId })) };
  }

  const user = await db.lmsUser.update({ where: { id }, data: update, select: LIST_SELECT });

  // Address-update welcome email (legacy `sendEmailAddressUpdateWelcome`).
  // Best-effort: a mail failure must never fail the profile update.
  let emailWelcomeSent = false;
  if (emailChangedTo) {
    try {
      const fn = (user.firstName || 'there').replace(/[<>&]/g, '');
      const roleLabel = String(user.role || '').replace(/_/g, ' ').toLowerCase();
      const loginUrl = `${process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || ''}/login`;
      await sendEmail({
        to: emailChangedTo,
        subject: 'QuikSkill — Your account email was updated',
        html: `
          <div style="max-width:600px;margin:0 auto;font-family:'Segoe UI',Tahoma,sans-serif;">
            <div style="background:linear-gradient(135deg,#667eea 0%,#764ba2 100%);padding:32px;border-radius:16px 16px 0 0;text-align:center;">
              <h1 style="color:#fff;margin:0;font-size:24px;">Welcome to QuikSkill</h1>
              <p style="color:rgba(255,255,255,0.9);margin:8px 0 0;">Your sign-in email was updated</p>
            </div>
            <div style="background:#fff;padding:32px;border:1px solid #e2e8f0;border-top:0;border-radius:0 0 16px 16px;">
              <p style="color:#374151;font-size:15px;">Hello <strong>${fn}</strong>,</p>
              <p style="color:#374151;font-size:15px;line-height:1.6;">Your administrator updated the email address on your QuikSkill LMS account${roleLabel ? ` (${roleLabel})` : ''}. Your password is unchanged — sign in with the email below.</p>
              <div style="background:#f0fdf4;border:1px solid #86efac;border-radius:8px;padding:14px;margin:16px 0;">
                <p style="color:#166534;font-size:12px;font-weight:600;margin:0 0 4px;text-transform:uppercase;">Your login email</p>
                <p style="color:#14532d;font-size:15px;margin:0;word-break:break-all;">${emailChangedTo}</p>
              </div>
              ${loginUrl ? `<p style="text-align:center;margin:20px 0;"><a href="${loginUrl}" style="display:inline-block;background:#667eea;color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:600;">Log in to QuikSkill</a></p>` : ''}
              <p style="color:#6b7280;font-size:13px;">If you did not expect this change, contact your administrator.</p>
            </div>
          </div>`,
      });
      emailWelcomeSent = true;
    } catch {
      /* best-effort — the address change already persisted */
    }
  }
  return { user, emailWelcomeSent };
}
