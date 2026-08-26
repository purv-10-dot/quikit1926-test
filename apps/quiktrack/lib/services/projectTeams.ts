import { db } from "@/lib/db";

/**
 * Teams linked to a space — the storage behind the project header's
 * "..." → Linked teams.
 *
 * Linking is an ASSOCIATION ONLY: it records that a team works on this space so
 * the team shows up in the space's context. It deliberately does NOT add the
 * team's members to `QtProjectMember` — membership (and therefore access) stays
 * an explicit, audited act performed through Add people / user management. A
 * link that silently granted project access would be a permission side-channel
 * around the project-role model.
 *
 * `QtProjectTeam` and `QtTeam` are both known to the generated Prisma client, so
 * this service uses the normal query API (unlike the raw-SQL services next to
 * it, which cover columns/tables the stale client hasn't caught up with).
 */

export interface LinkedTeam {
  teamId: string;
  name: string;
  description: string | null;
  color: string | null;
  leadUserId: string | null;
  memberCount: number;
  addedAt: Date;
  addedBy: string | null;
}

export interface AvailableTeam {
  teamId: string;
  name: string;
  description: string | null;
  color: string | null;
  memberCount: number;
}

/** Teams currently linked to this space, alphabetically. */
export async function listLinkedTeams(
  orgId: string,
  projectId: string,
): Promise<LinkedTeam[]> {
  const rows = await db.qtProjectTeam.findMany({
    // The org filter goes through BOTH sides of the join table (which carries no
    // orgId of its own), so a link row can never surface a team or a project
    // from another org.
    where: {
      projectId,
      project: { orgId, isDeleted: false },
      team: { orgId, isDeleted: false },
    },
    orderBy: { team: { name: "asc" } },
    select: {
      teamId: true,
      addedAt: true,
      addedBy: true,
      team: {
        select: {
          name: true,
          description: true,
          color: true,
          leadUserId: true,
          _count: { select: { members: true } },
        },
      },
    },
  });
  return rows.map((r) => ({
    teamId: r.teamId,
    name: r.team.name,
    description: r.team.description,
    color: r.team.color,
    leadUserId: r.team.leadUserId,
    memberCount: r.team._count.members,
    addedAt: r.addedAt,
    addedBy: r.addedBy,
  }));
}

/** Org teams that are NOT yet linked to this space — the "link a team" picker. */
export async function listAvailableTeams(
  orgId: string,
  projectId: string,
): Promise<AvailableTeam[]> {
  const rows = await db.qtTeam.findMany({
    where: {
      orgId,
      isDeleted: false,
      projectTeams: { none: { projectId } },
    },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      description: true,
      color: true,
      _count: { select: { members: true } },
    },
  });
  return rows.map((t) => ({
    teamId: t.id,
    name: t.name,
    description: t.description,
    color: t.color,
    memberCount: t._count.members,
  }));
}

export type LinkResult = "linked" | "already-linked" | "team-not-found";

/**
 * Link a team to a space. Verifies the team lives in the SAME org first, so a
 * crafted teamId from another tenant can't create a cross-org link.
 * Idempotent: re-linking an already-linked team reports "already-linked"
 * instead of erroring on the unique index.
 */
export async function linkTeamToProject(
  orgId: string,
  projectId: string,
  teamId: string,
  userId: string,
): Promise<LinkResult> {
  const team = await db.qtTeam.findFirst({
    where: { id: teamId, orgId, isDeleted: false },
    select: { id: true },
  });
  if (!team) return "team-not-found";

  const existing = await db.qtProjectTeam.findUnique({
    where: { projectId_teamId: { projectId, teamId } },
    select: { id: true },
  });
  if (existing) return "already-linked";

  await db.qtProjectTeam.create({
    data: { projectId, teamId, addedBy: userId },
  });
  return "linked";
}

/**
 * Unlink a team from a space. Returns false when there was no such link (so the
 * caller can 404), and re-verifies org ownership of the team on the way out.
 */
export async function unlinkTeamFromProject(
  orgId: string,
  projectId: string,
  teamId: string,
): Promise<boolean> {
  const link = await db.qtProjectTeam.findFirst({
    where: { projectId, teamId, team: { orgId } },
    select: { id: true },
  });
  if (!link) return false;
  await db.qtProjectTeam.delete({ where: { id: link.id } });
  return true;
}
