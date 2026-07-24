/**
 * Groups service — ported from GroupsService (Prisma).
 *
 * Mongo stored `Group.memberIds` as an embedded ObjectId array and `populate`d
 * it on read. Postgres models it as the `LmsGroupMember` join table, so every
 * read has to hydrate it back into the array shape the client expects
 * (`memberIds: User[]` + `memberCount` — see `app/(tenant-admin)/groups/page.tsx:37-38`).
 *
 * Four divergences from the first port were fixed on 2026-07-17; none were in
 * GAP_REPORT, which listed no detail for this module:
 *  1. `create` / `update` / `addMembers` / `removeMember` returned a BARE group —
 *     no `memberIds`, no `memberCount` — where the reads returned enriched ones.
 *     The UI happens to refetch instead of using the response, so nothing
 *     crashes today, but the contract was inconsistent and `group.memberIds.length`
 *     on a mutation response would throw.
 *  2. `findAll` was O(3N) queries — the legacy's `populate` was 2 total.
 *  3. Members were never checked against the tenant, so a group could hold
 *     another org's users.
 *  4. Duplicate ids in `memberIds` hit the `@@unique([groupId, userId])`
 *     constraint and surfaced as a confusing 409.
 */
import { prisma } from '@/lib/prisma';
import { NotFound, Conflict, BadRequest } from '@/lib/http';

type GroupRow = { id: string; createdBy: string | null } & Record<string, unknown>;

const MEMBER_SELECT = {
  id: true, firstName: true, lastName: true, email: true, role: true, profilePicture: true,
} as const;

/**
 * Hydrate `memberIds` + `createdBy` for many groups in a FIXED number of
 * queries, regardless of how many groups there are.
 *
 * The previous shape called a per-group helper, so listing 40 groups fired ~120
 * queries where the legacy's `populate` fired 2. Members and creators are
 * fetched once each and joined in memory.
 */
async function enrichGroups<T extends GroupRow>(groups: T[]) {
  if (groups.length === 0) return [];

  const groupIds = groups.map((g) => g.id);
  const links = await prisma.lmsGroupMember.findMany({
    where: { groupId: { in: groupIds } },
    select: { groupId: true, userId: true },
  });

  const userIds = [...new Set(links.map((l) => l.userId))];
  const creatorIds = [...new Set(groups.map((g) => g.createdBy).filter((v): v is string => Boolean(v)))];
  const lookupIds = [...new Set([...userIds, ...creatorIds])];

  const users = lookupIds.length
    ? await prisma.lmsUser.findMany({ where: { id: { in: lookupIds } }, select: MEMBER_SELECT })
    : [];
  const userMap = new Map(users.map((u) => [u.id, u]));

  const byGroup = new Map<string, string[]>();
  for (const l of links) {
    const list = byGroup.get(l.groupId);
    if (list) list.push(l.userId);
    else byGroup.set(l.groupId, [l.userId]);
  }

  return groups.map((g) => {
    const ids = byGroup.get(g.id) ?? [];
    // A member whose user row is gone is dropped, matching Mongoose populate.
    const members = ids.map((id) => userMap.get(id)).filter(Boolean);
    const creator = g.createdBy ? userMap.get(g.createdBy) : null;
    return {
      ...g,
      memberIds: members,
      createdBy: creator
        ? { id: creator.id, firstName: creator.firstName, lastName: creator.lastName, email: creator.email }
        : null,
      // Counted from the LINKS, not the resolved users, so a deleted user does
      // not silently change the group's size.
      memberCount: ids.length,
    };
  });
}

async function enrichGroup<T extends GroupRow>(group: T) {
  return (await enrichGroups([group]))[0];
}

/** Re-read and enrich, so every mutation returns the same shape the reads do. */
async function enrichById(groupId: string) {
  const group = await prisma.lmsGroup.findUnique({ where: { id: groupId } });
  if (!group) throw NotFound('Group not found');
  return enrichGroup(group);
}

/**
 * Reject ids that are not users of THIS org, and de-duplicate.
 *
 * Neither the legacy nor the first port checked: a tenant admin could put
 * another org's users into a group by id. Course assignment happens to catch it
 * downstream, but the group itself would still hold and display foreign users.
 */
async function assertMembersInOrg(orgId: string, memberIds: string[]): Promise<string[]> {
  const unique = [...new Set((memberIds || []).filter(Boolean))];
  if (unique.length === 0) return [];
  const found = await prisma.lmsUser.findMany({ where: { id: { in: unique }, orgId }, select: { id: true } });
  if (found.length !== unique.length) throw BadRequest('One or more users do not belong to this tenant');
  return unique;
}

export async function create(orgId: string, createdBy: string, dto: { name: string; description?: string; memberIds?: string[] }) {
  const existing = await prisma.lmsGroup.findFirst({ where: { orgId, name: dto.name } });
  if (existing) throw Conflict(`A group named "${dto.name}" already exists`);

  // Deduped before the write — duplicates in the payload would otherwise trip
  // @@unique([groupId, userId]) and surface as a bewildering 409.
  const memberIds = await assertMembersInOrg(orgId, dto.memberIds ?? []);

  const group = await prisma.lmsGroup.create({
    data: {
      orgId, name: dto.name, description: dto.description, createdBy,
      ...(memberIds.length ? { members: { create: memberIds.map((userId) => ({ userId })) } } : {}),
    },
  });
  return enrichGroup(group);
}

export async function findAll(orgId: string) {
  const groups = await prisma.lmsGroup.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' } });
  return enrichGroups(groups);
}

export async function findOne(orgId: string, groupId: string) {
  const group = await prisma.lmsGroup.findFirst({ where: { id: groupId, orgId } });
  if (!group) throw NotFound('Group not found');
  return enrichGroup(group);
}

export async function update(orgId: string, groupId: string, dto: { name?: string; description?: string; memberIds?: string[] }) {
  const group = await prisma.lmsGroup.findFirst({ where: { id: groupId, orgId } });
  if (!group) throw NotFound('Group not found');

  if (dto.name && dto.name !== group.name) {
    const conflict = await prisma.lmsGroup.findFirst({ where: { orgId, name: dto.name, id: { not: groupId } } });
    if (conflict) throw Conflict(`A group named "${dto.name}" already exists`);
  }

  // Validate BEFORE any write, so a bad member id cannot leave the name updated
  // and the roster half-applied.
  const memberIds = dto.memberIds !== undefined ? await assertMembersInOrg(orgId, dto.memberIds) : undefined;

  await prisma.lmsGroup.update({
    where: { id: groupId },
    data: {
      ...(dto.name ? { name: dto.name } : {}),
      ...(dto.description !== undefined ? { description: dto.description } : {}),
    },
  });

  if (memberIds !== undefined) {
    // Wholesale replace — `memberIds` on the legacy DTO was the full roster.
    await prisma.lmsGroupMember.deleteMany({ where: { groupId } });
    if (memberIds.length) {
      await prisma.lmsGroupMember.createMany({
        data: memberIds.map((userId) => ({ groupId, userId })),
        skipDuplicates: true,
      });
    }
  }
  return enrichById(groupId);
}

export async function remove(orgId: string, groupId: string) {
  const result = await prisma.lmsGroup.deleteMany({ where: { id: groupId, orgId } });
  if (result.count === 0) throw NotFound('Group not found');
}

export async function addMembers(orgId: string, groupId: string, dto: { memberIds: string[] }) {
  const group = await prisma.lmsGroup.findFirst({ where: { id: groupId, orgId } });
  if (!group) throw NotFound('Group not found');

  const memberIds = await assertMembersInOrg(orgId, dto.memberIds ?? []);
  if (memberIds.length) {
    // skipDuplicates reproduces the legacy's "only push ids not already present".
    await prisma.lmsGroupMember.createMany({
      data: memberIds.map((userId) => ({ groupId, userId })),
      skipDuplicates: true,
    });
  }
  return enrichById(groupId);
}

export async function removeMember(orgId: string, groupId: string, memberId: string) {
  const group = await prisma.lmsGroup.findFirst({ where: { id: groupId, orgId } });
  if (!group) throw NotFound('Group not found');
  await prisma.lmsGroupMember.deleteMany({ where: { groupId, userId: memberId } });
  return enrichById(groupId);
}

export async function getMemberIds(orgId: string, groupId: string): Promise<string[]> {
  const group = await prisma.lmsGroup.findFirst({ where: { id: groupId, orgId } });
  if (!group) throw NotFound('Group not found');
  const members = await prisma.lmsGroupMember.findMany({ where: { groupId }, select: { userId: true } });
  return members.map((m) => m.userId);
}
