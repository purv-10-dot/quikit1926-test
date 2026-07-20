/**
 * Users service — ported from UsersService (Prisma). Tenant scoping is applied
 * by callers via the orgId argument (SUPER_ADMIN passes undefined to span all).
 */
import type { Prisma, LmsUserRole as UserRole } from '@prisma/client';
import { LmsUserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest, Forbidden, NotFound } from '@/lib/http';

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
    return prisma.lmsUser.findMany({ where: base, select: SEARCH_SELECT, orderBy, take: 20 });
  }

  const words = trimmed.split(/\s+/).filter(Boolean);

  if (words.length === 1) {
    const w = words[0];
    // Prefix matches first — the legacy ranked these above contains-matches so
    // typing "ada" surfaces Ada before Amadadu.
    const prefixMatches = await prisma.lmsUser.findMany({
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

    const containsMatches = await prisma.lmsUser.findMany({
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

  return prisma.lmsUser.findMany({
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
  return prisma.lmsUser.findMany({ where, select: LIST_SELECT, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] });
}

export async function findUsersByIds(orgId: string, ids: string[]) {
  if (!ids.length) return [];
  return prisma.lmsUser.findMany({
    where: { id: { in: ids }, orgId },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, grade: true, section: true, studentId: true },
  });
}

export async function promoteToSubAdmin(userId: string, orgId: string) {
  const user = await prisma.lmsUser.findUnique({ where: { id: userId } });
  if (!user) throw NotFound('User not found');
  if (!user.orgId || user.orgId !== orgId) throw Forbidden('User is not in this organization');
  if (user.secondaryRole === 'SUB_ADMIN') throw BadRequest('User already has Sub Admin role');
  return prisma.lmsUser.update({ where: { id: userId }, data: { secondaryRole: 'SUB_ADMIN' }, select: LIST_SELECT });
}

export async function revokeSubAdmin(userId: string, orgId: string) {
  const user = await prisma.lmsUser.findUnique({ where: { id: userId } });
  if (!user) throw NotFound('User not found');
  if (!user.orgId || user.orgId !== orgId) throw Forbidden('User is not in this organization');
  return prisma.lmsUser.update({ where: { id: userId }, data: { secondaryRole: null }, select: LIST_SELECT });
}

export async function toggleActive(id: string, orgId: string | undefined, isActive: boolean) {
  const where: Prisma.LmsUserWhereInput = { id };
  if (orgId) where.orgId = orgId;
  const existing = await prisma.lmsUser.findFirst({ where });
  if (!existing) throw NotFound('User not found');
  return prisma.lmsUser.update({ where: { id }, data: { isActive }, select: LIST_SELECT });
}

export async function updateUser(id: string, orgId: string | undefined, data: Record<string, unknown>) {
  const where: Prisma.LmsUserWhereInput = { id };
  if (orgId) where.orgId = orgId;
  const current = await prisma.lmsUser.findFirst({ where });
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

  if (data.email !== undefined) {
    const newEmail = String(data.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw BadRequest('A valid email address is required');
    if (newEmail !== current.email.toLowerCase()) {
      const dup = await prisma.lmsUser.findFirst({ where: { id: { not: id }, email: newEmail, orgId: current.orgId } });
      if (dup) throw BadRequest('Another user with this email already exists');
      update.email = newEmail;
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

  const user = await prisma.lmsUser.update({ where: { id }, data: update, select: LIST_SELECT });
  return { user, emailWelcomeSent: false };
}
