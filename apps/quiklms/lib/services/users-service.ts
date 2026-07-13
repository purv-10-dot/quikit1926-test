/**
 * Users service — ported from UsersService (Prisma). Tenant scoping is applied
 * by callers via the orgId argument (SUPER_ADMIN passes undefined to span all).
 */
import type { Prisma, UserRole } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { BadRequest, Forbidden, NotFound } from '@/lib/http';

const LIST_SELECT = {
  id: true, firstName: true, lastName: true, email: true, role: true, secondaryRole: true,
  profilePicture: true, grade: true, section: true, studentId: true, employeeId: true, parentCode: true,
  isActive: true, managerId: true, orgId: true, phone: true, subjects: true, createdAt: true,
} satisfies Prisma.UserSelect;

function nameSearch(search: string): Prisma.UserWhereInput {
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

export async function searchUsers(orgId: string | undefined, query?: string, role?: string, excludeRoles: string[] = []) {
  const where: Prisma.UserWhereInput = { isActive: true };
  if (orgId) where.orgId = orgId;
  if (role) where.role = role as UserRole;
  else if (excludeRoles.length) where.role = { notIn: excludeRoles as UserRole[] };
  if (query?.trim()) Object.assign(where, nameSearch(query));
  return prisma.user.findMany({
    where,
    select: { id: true, firstName: true, lastName: true, email: true, role: true, profilePicture: true, grade: true },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
    take: 20,
  });
}

export async function findAllUsers(orgId: string | undefined, search?: string, role?: string, excludeRoles: string[] = []) {
  const where: Prisma.UserWhereInput = {};
  if (orgId) where.orgId = orgId;
  if (role === 'SUB_ADMIN') where.OR = [{ role: 'SUB_ADMIN' }, { secondaryRole: 'SUB_ADMIN' }];
  else if (role && role !== 'ALL') where.role = role as UserRole;
  else if (excludeRoles.length) where.role = { notIn: excludeRoles as UserRole[] };
  if (search?.trim()) Object.assign(where, nameSearch(search));
  return prisma.user.findMany({ where, select: LIST_SELECT, orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }] });
}

export async function findUsersByIds(orgId: string, ids: string[]) {
  if (!ids.length) return [];
  return prisma.user.findMany({
    where: { id: { in: ids }, orgId },
    select: { id: true, firstName: true, lastName: true, email: true, role: true, grade: true, section: true, studentId: true },
  });
}

export async function promoteToSubAdmin(userId: string, orgId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw NotFound('User not found');
  if (!user.orgId || user.orgId !== orgId) throw Forbidden('User is not in this organization');
  if (user.secondaryRole === 'SUB_ADMIN') throw BadRequest('User already has Sub Admin role');
  return prisma.user.update({ where: { id: userId }, data: { secondaryRole: 'SUB_ADMIN' }, select: LIST_SELECT });
}

export async function revokeSubAdmin(userId: string, orgId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw NotFound('User not found');
  if (!user.orgId || user.orgId !== orgId) throw Forbidden('User is not in this organization');
  return prisma.user.update({ where: { id: userId }, data: { secondaryRole: null }, select: LIST_SELECT });
}

export async function toggleActive(id: string, orgId: string | undefined, isActive: boolean) {
  const where: Prisma.UserWhereInput = { id };
  if (orgId) where.orgId = orgId;
  const existing = await prisma.user.findFirst({ where });
  if (!existing) throw NotFound('User not found');
  return prisma.user.update({ where: { id }, data: { isActive }, select: LIST_SELECT });
}

export async function updateUser(id: string, orgId: string | undefined, data: Record<string, unknown>) {
  const where: Prisma.UserWhereInput = { id };
  if (orgId) where.orgId = orgId;
  const current = await prisma.user.findFirst({ where });
  if (!current) throw NotFound('User not found or access denied');

  const update: Prisma.UserUpdateInput = {};
  const allowed = ['firstName', 'lastName', 'phone', 'grade', 'section', 'studentId', 'employeeId', 'subjects',
    'ratePerClass', 'ratePerHour', 'rateType', 'qualification', 'monthlyPayout', 'guardianContact', 'guardianRelation',
    'maxSlotsPerWeek', 'tutoringEnabled', 'tutoringCreditCost', 'dateOfBirth', 'managerId'];
  for (const k of allowed) if (data[k] !== undefined) (update as Record<string, unknown>)[k] = k === 'dateOfBirth' ? new Date(data[k] as string) : data[k];

  if (data.email !== undefined) {
    const newEmail = String(data.email).trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw BadRequest('A valid email address is required');
    if (newEmail !== current.email.toLowerCase()) {
      const dup = await prisma.user.findFirst({ where: { id: { not: id }, email: newEmail, orgId: current.orgId } });
      if (dup) throw BadRequest('Another user with this email already exists');
      update.email = newEmail;
    }
  }

  const user = await prisma.user.update({ where: { id }, data: update, select: LIST_SELECT });
  return { user, emailWelcomeSent: false };
}
