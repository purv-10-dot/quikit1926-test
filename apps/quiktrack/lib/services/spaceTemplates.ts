import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { getSpaceBackground } from "@/lib/services/spaceBackground";
import type { SpaceBackground } from "@/lib/spaceBackgrounds";

/**
 * Saved space templates — the storage behind the project header's
 * "..." → Save as template.
 *
 * A template is a point-in-time SNAPSHOT of a space's configuration, not a live
 * link to it. Later edits to the source space do not propagate; that's what
 * makes a template stable enough to build new spaces from. Deleting the source
 * space leaves the template fully usable (see the `sourceProjectId` note on the
 * model — it's provenance, not a foreign key).
 *
 * `QtSpaceTemplate` is addressed with raw SQL for the same reason as
 * `projectStars.ts` and `QtProject.tabConfig`: the generated Prisma client on
 * the dev box is stale and doesn't know the table yet. Every statement is
 * parameterised and org-scoped.
 */

/** Bump when the snapshot shape changes incompatibly. */
export const SPACE_TEMPLATE_VERSION = 1 as const;

export interface SpaceTemplateConfig {
  version: typeof SPACE_TEMPLATE_VERSION;
  source: {
    projectId: string;
    projectKey: string;
    name: string;
    capturedAt: string;
  };
  space: {
    projectType: string;
    managementStyle: string;
    templateKey: string;
    backlogName: string | null;
    tabConfig: string[] | null;
    background: SpaceBackground | null;
  };
  issueTypes: { name: string; color: string; icon: string | null; orderIndex: number }[];
  statuses: {
    name: string;
    color: string;
    category: string;
    orderIndex: number;
    isHidden: boolean;
  }[];
  /** Columns reference statuses BY NAME — ids are meaningless in a new space. */
  boardColumns: { name: string; orderIndex: number; statusNames: string[] }[];
  customFields: {
    name: string;
    key: string;
    type: string;
    description: string | null;
    isRequired: boolean;
    placeholder: string | null;
    helpText: string | null;
    position: number;
    options: { label: string; value: string; position: number }[];
  }[];
  projectRoles: {
    name: string;
    description: string | null;
    isDefault: boolean;
    permissions: { resource: string; action: string }[];
  }[];
  sprints: { enabled: boolean };
}

export interface SpaceTemplateRow {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  sourceProjectId: string | null;
  templateKey: string;
  icon: string | null;
  color: string | null;
  config: SpaceTemplateConfig;
  createdAt: Date;
  createdBy: string | null;
}

/** What the snapshot captured, for the "Saved" confirmation and the list card. */
export interface SpaceTemplateSummary {
  issueTypes: number;
  statuses: number;
  boardColumns: number;
  customFields: number;
  projectRoles: number;
  sprintsEnabled: boolean;
}

export function summarizeTemplate(config: SpaceTemplateConfig): SpaceTemplateSummary {
  return {
    issueTypes: config.issueTypes.length,
    statuses: config.statuses.length,
    boardColumns: config.boardColumns.length,
    customFields: config.customFields.length,
    projectRoles: config.projectRoles.length,
    sprintsEnabled: config.sprints.enabled,
  };
}

/**
 * Build the configuration snapshot for a space. Returns null when the project
 * isn't in this org (so the caller 404s rather than writing an empty template).
 *
 * Everything is captured by NAME/KEY rather than id: a template is replayed into
 * a brand-new space where none of the source ids exist.
 */
export async function captureSpaceConfig(
  orgId: string,
  projectId: string,
): Promise<SpaceTemplateConfig | null> {
  const project = await db.qtProject.findFirst({
    where: { id: projectId, orgId, isDeleted: false },
    select: {
      id: true,
      projectKey: true,
      name: true,
      projectType: true,
      managementStyle: true,
      templateKey: true,
      backlogName: true,
    },
  });
  if (!project) return null;

  const [issueTypes, statuses, boardColumns, customFields, projectRoles, background, tabConfig] =
    await Promise.all([
      db.qtIssueType.findMany({
        where: { projectId, isDeleted: false },
        orderBy: { orderIndex: "asc" },
        select: { name: true, color: true, icon: true, orderIndex: true },
      }),
      db.qtIssueStatus.findMany({
        where: { projectId, isDeleted: false },
        orderBy: { orderIndex: "asc" },
        select: {
          name: true,
          color: true,
          category: true,
          orderIndex: true,
          isHidden: true,
        },
      }),
      db.qtBoardColumn.findMany({
        where: { projectId },
        orderBy: { orderIndex: "asc" },
        select: {
          name: true,
          orderIndex: true,
          statuses: {
            orderBy: { orderIndex: "asc" },
            select: { status: { select: { name: true } } },
          },
        },
      }),
      db.qtCustomField.findMany({
        where: { projectId, orgId, isDeleted: false },
        orderBy: { position: "asc" },
        select: {
          name: true,
          key: true,
          type: true,
          description: true,
          isRequired: true,
          placeholder: true,
          helpText: true,
          position: true,
          options: {
            where: { isActive: true },
            orderBy: { position: "asc" },
            select: { label: true, value: true, position: true },
          },
        },
      }),
      db.qtProjectRole.findMany({
        where: { projectId, orgId },
        orderBy: { name: "asc" },
        select: {
          name: true,
          description: true,
          isDefault: true,
          permissions: { select: { resource: true, action: true } },
        },
      }),
      getSpaceBackground(orgId, projectId),
      readTabConfig(orgId, projectId),
    ]);

  return {
    version: SPACE_TEMPLATE_VERSION,
    source: {
      projectId: project.id,
      projectKey: project.projectKey,
      name: project.name,
      capturedAt: new Date().toISOString(),
    },
    space: {
      projectType: project.projectType,
      managementStyle: project.managementStyle,
      templateKey: project.templateKey,
      backlogName: project.backlogName,
      tabConfig,
      background,
    },
    issueTypes,
    statuses,
    boardColumns: boardColumns.map((c) => ({
      name: c.name,
      orderIndex: c.orderIndex,
      statusNames: c.statuses.map((s) => s.status.name),
    })),
    customFields,
    projectRoles,
    // Only the scrum template runs sprints; functional (Kanban) and discovery
    // spaces don't, so a template built from them starts sprint-free too.
    sprints: { enabled: project.templateKey === "scrum" },
  };
}

async function readTabConfig(orgId: string, projectId: string): Promise<string[] | null> {
  const rows = await db.$queryRaw<{ tabConfig: string[] | null }[]>`
    SELECT "tabConfig" FROM app_quiktrack."QtProject"
    WHERE "id" = ${projectId} AND "orgId" = ${orgId}
    LIMIT 1
  `;
  return rows[0]?.tabConfig ?? null;
}

/** Thrown when the org already has a template with this name. */
export class DuplicateTemplateNameError extends Error {
  constructor(name: string) {
    super(`A template named "${name}" already exists.`);
    this.name = "DuplicateTemplateNameError";
  }
}

/** Persist a snapshot as a named, org-scoped template. */
export async function saveSpaceTemplate(params: {
  orgId: string;
  userId: string;
  name: string;
  description?: string | null;
  sourceProjectId: string;
  templateKey: string;
  icon?: string | null;
  color?: string | null;
  config: SpaceTemplateConfig;
}): Promise<{ id: string; name: string }> {
  const id = `spt_${randomUUID()}`;
  // The unique index is (orgId, name) — check first so we can return a friendly
  // 409 instead of leaking a Postgres constraint error.
  const clash = await db.$queryRaw<{ id: string }[]>`
    SELECT "id" FROM app_quiktrack."QtSpaceTemplate"
    WHERE "orgId" = ${params.orgId} AND "name" = ${params.name} AND "isDeleted" = false
    LIMIT 1
  `;
  if (clash.length > 0) throw new DuplicateTemplateNameError(params.name);

  await db.$executeRaw`
    INSERT INTO app_quiktrack."QtSpaceTemplate"
      ("id", "orgId", "name", "description", "sourceProjectId", "templateKey",
       "icon", "color", "config", "createdBy", "updatedBy", "createdAt", "updatedAt")
    VALUES
      (${id}, ${params.orgId}, ${params.name}, ${params.description ?? null},
       ${params.sourceProjectId}, ${params.templateKey}, ${params.icon ?? null},
       ${params.color ?? null}, ${JSON.stringify(params.config)}::jsonb,
       ${params.userId}, ${params.userId}, now(), now())
  `;
  return { id, name: params.name };
}

/** Every live template in this org, newest first. */
export async function listSpaceTemplates(orgId: string): Promise<SpaceTemplateRow[]> {
  return db.$queryRaw<SpaceTemplateRow[]>`
    SELECT "id", "orgId", "name", "description", "sourceProjectId", "templateKey",
           "icon", "color", "config", "createdAt", "createdBy"
    FROM app_quiktrack."QtSpaceTemplate"
    WHERE "orgId" = ${orgId} AND "isDeleted" = false
    ORDER BY "createdAt" DESC
  `;
}
