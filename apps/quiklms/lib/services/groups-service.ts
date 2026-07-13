/**
 * Groups service — ported from GroupsService (Prisma).
 * Group.memberIds[] is modelled via the groupMember join table. Member/creator
 * enrichment is done with manual user lookups (scalar refs — no relation include).
 */
import { prisma } from '@/lib/prisma';
import { NotFound, Conflict } from '@/lib/http';

async function enrichGroup(group: { id: string; createdBy: string | null } & Record<string, unknown>) {
  const members = await prisma.groupMember.findMany({ where: { groupId: group.id }, select: { userId: true } });
  const memberIds = members.map((m) => m.userId);
  const users = memberIds.length
    ? await prisma.user.findMany({
        where: { id: { in: memberIds } },
        select: { id: true, firstName: true, lastName: true, email: true, role: true, profilePicture: true },
      })
    : [];
  const creator = group.createdBy
    ? await prisma.user.findUnique({ where: { id: group.createdBy }, select: { id: true, firstName: true, lastName: true, email: true } })
    : null;
  return { ...group, memberIds: users, createdBy: creator, memberCount: memberIds.length };
}

export async function create(orgId: string, createdBy: string, dto: { name: string; description?: string; memberIds?: string[] }) {
  const existing = await prisma.group.findFirst({ where: { orgId, name: dto.name } });
  if (existing) throw Conflict(`A group named "${dto.name}" already exists`);
  const group = await prisma.group.create({
    data: {
      orgId, name: dto.name, description: dto.description, createdBy,
      ...(dto.memberIds?.length ? { members: { create: dto.memberIds.map((userId) => ({ userId })) } } : {}),
    },
  });
  return group;
}

export async function findAll(orgId: string) {
  const groups = await prisma.group.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' } });
  return Promise.all(groups.map((g) => enrichGroup(g)));
}

export async function findOne(orgId: string, groupId: string) {
  const group = await prisma.group.findFirst({ where: { id: groupId, orgId } });
  if (!group) throw NotFound('Group not found');
  return enrichGroup(group);
}

export async function update(orgId: string, groupId: string, dto: { name?: string; description?: string; memberIds?: string[] }) {
  const group = await prisma.group.findFirst({ where: { id: groupId, orgId } });
  if (!group) throw NotFound('Group not found');

  if (dto.name && dto.name !== group.name) {
    const conflict = await prisma.group.findFirst({ where: { orgId, name: dto.name, id: { not: groupId } } });
    if (conflict) throw Conflict(`A group named "${dto.name}" already exists`);
  }

  const updated = await prisma.group.update({
    where: { id: groupId },
    data: {
      ...(dto.name ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
    },
  });

  if (dto.memberIds !== undefined) {
    await prisma.groupMember.deleteMany({ where: { groupId } });
    if (dto.memberIds.length) {
      await prisma.groupMember.createMany({ data: dto.memberIds.map((userId) => ({ groupId, userId })), skipDuplicates: true });
    }
  }
  return updated;
}

export async function remove(orgId: string, groupId: string) {
  const result = await prisma.group.deleteMany({ where: { id: groupId, orgId } });
  if (result.count === 0) throw NotFound('Group not found');
}

export async function addMembers(orgId: string, groupId: string, dto: { memberIds: string[] }) {
  const group = await prisma.group.findFirst({ where: { id: groupId, orgId } });
  if (!group) throw NotFound('Group not found');
  if (dto.memberIds.length) {
    await prisma.groupMember.createMany({ data: dto.memberIds.map((userId) => ({ groupId, userId })), skipDuplicates: true });
  }
  return prisma.group.findUnique({ where: { id: groupId } });
}

export async function removeMember(orgId: string, groupId: string, memberId: string) {
  const group = await prisma.group.findFirst({ where: { id: groupId, orgId } });
  if (!group) throw NotFound('Group not found');
  await prisma.groupMember.deleteMany({ where: { groupId, userId: memberId } });
  return prisma.group.findUnique({ where: { id: groupId } });
}

export async function getMemberIds(orgId: string, groupId: string): Promise<string[]> {
  const group = await prisma.group.findFirst({ where: { id: groupId, orgId } });
  if (!group) throw NotFound('Group not found');
  const members = await prisma.groupMember.findMany({ where: { groupId }, select: { userId: true } });
  return members.map((m) => m.userId);
}
