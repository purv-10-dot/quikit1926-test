/**
 * Read/write the lead pipeline config stored on
 * OrgWorkspaceSettings.settings.leadPipelineConfig.
 *
 * Shape:
 *   {
 *     stages: string[],
 *     statuses: string[],
 *     substatuses: string[],
 *     dependentRules: {
 *       sourceToStages?:      Record<string, string[]>,
 *       stageToStatuses?:     Record<string, string[]>,
 *       statusToSubstatuses?: Record<string, string[]>,
 *     }
 *   }
 */

import { prisma } from "@/lib/db/prisma";

export const DEFAULT_STAGES = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"];
export const DEFAULT_STATUSES = ["Open", "Working", "Disqualified", "Converted"];
export const DEFAULT_SUBSTATUSES: string[] = [];

export interface DependentRules {
  sourceToStages?:      Record<string, string[]>;
  stageToStatuses?:     Record<string, string[]>;
  statusToSubstatuses?: Record<string, string[]>;
}

export interface PipelineConfig {
  stages:         string[];
  statuses:       string[];
  substatuses:    string[];
  dependentRules: DependentRules;
}

interface SettingsTree {
  leadPipelineConfig?: Partial<PipelineConfig>;
  [k: string]: unknown;
}

async function readTree(orgId: string): Promise<SettingsTree> {
  const row = await prisma.qceOrgWorkspaceSettings.findUnique({ where: { orgId } });
  return ((row?.settings as SettingsTree | null) ?? {}) as SettingsTree;
}

async function writeTree(orgId: string, next: SettingsTree): Promise<void> {
  await prisma.qceOrgWorkspaceSettings.upsert({
    where: { orgId },
    create: { orgId, settings: next as object },
    update: { settings: next as object },
  });
}

export async function getPipelineConfig(orgId: string): Promise<PipelineConfig> {
  const tree = await readTree(orgId);
  const cfg = tree.leadPipelineConfig ?? {};

  // Derive statuses, substatuses, and statusToSubstatuses from the DB tables
  // (QceLeadStatus / QceLeadSubStatus / QceLeadStatusSubStatus).
  // These are authoritative — the stale JSON blob in OrgWorkspaceSettings may
  // contain reversed or empty data from before the migration.
  const [dbStatuses, dbSubStatuses] = await Promise.all([
    prisma.qceLeadStatus.findMany({
      include: {
        subStatuses: {
          include: { leadSubStatus: { select: { name: true } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    prisma.qceLeadSubStatus.findMany({
      select: { name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  // Build statusToSubstatuses correctly: { [statusName]: [subStatusName, …] }
  const dbStatusToSubstatuses: Record<string, string[]> = {};
  for (const status of dbStatuses) {
    if (status.subStatuses.length > 0) {
      dbStatusToSubstatuses[status.name] = status.subStatuses.map(
        (m) => m.leadSubStatus.name,
      );
    }
  }

  // Use DB values when the tables are populated; fall back to workspace JSON
  // only when the tables are empty (e.g. before the seed has been run).
  const statuses =
    dbStatuses.length > 0
      ? dbStatuses.map((s) => s.name)
      : Array.isArray(cfg.statuses) && cfg.statuses.length > 0
        ? cfg.statuses
        : DEFAULT_STATUSES;

  const substatuses =
    dbSubStatuses.length > 0
      ? dbSubStatuses.map((s) => s.name)
      : Array.isArray(cfg.substatuses)
        ? cfg.substatuses
        : DEFAULT_SUBSTATUSES;

  const statusToSubstatuses =
    Object.keys(dbStatusToSubstatuses).length > 0
      ? dbStatusToSubstatuses
      : (cfg.dependentRules?.statusToSubstatuses ?? {});

  return {
    stages:
      Array.isArray(cfg.stages) && cfg.stages.length > 0
        ? cfg.stages
        : DEFAULT_STAGES,
    statuses,
    substatuses,
    dependentRules: {
      ...cfg.dependentRules,
      statusToSubstatuses,
    },
  };
}

export async function setPipelineConfig(orgId: string, patch: Partial<PipelineConfig>): Promise<PipelineConfig> {
  const tree    = await readTree(orgId);
  const current = await getPipelineConfig(orgId);
  const merged: PipelineConfig = {
    stages:         patch.stages         ?? current.stages,
    statuses:       patch.statuses       ?? current.statuses,
    substatuses:    patch.substatuses    ?? current.substatuses,
    dependentRules: patch.dependentRules ?? current.dependentRules,
  };
  await writeTree(orgId, { ...tree, leadPipelineConfig: merged });
  return merged;
}

export function allowedStagesForSource(rules: DependentRules, source: string | null | undefined): string[] {
  if (!source) return [];
  return rules.sourceToStages?.[source] ?? [];
}

export function allowedStatusesForStage(rules: DependentRules, stage: string | null | undefined): string[] {
  if (!stage) return [];
  return rules.stageToStatuses?.[stage] ?? [];
}

export function allowedSubstatusesForStatus(rules: DependentRules, status: string | null | undefined): string[] {
  if (!status) return [];
  return rules.statusToSubstatuses?.[status] ?? [];
}

export interface PipelineCascadeViolation {
  field: "stage" | "status" | "substatus";
  /** Top-level error message, matching the API `{ error }` field. */
  message: string;
  /** Field → message map, matching the API `{ errors }` field. */
  errors: Record<string, string>;
}

/**
 * Validate the Source → Stage → Status → Sub-Status cascade for a single write.
 *
 * Single source of truth shared by lead create, PATCH, and transition so the
 * same guards apply on every write path (launch item 5). Pass the EFFECTIVE
 * values (existing row merged with the incoming patch) plus `writing` flags
 * marking which fields this request is actually setting.
 *
 * Enforcement model — each edge fires only when the DOWNSTREAM field it
 * constrains is the one being written, validated against the effective parent:
 *   - membership: stage when writing stage, status when writing status.
 *   - source → stage: only when `source` is written (create, or a source change).
 *     NOT on a stage-only move — `sourceToStages` is an entry-routing rule, and
 *     re-imposing it on every transition would pin a lead to its initial stages
 *     forever (a lead from a source mapped to one stage could never progress).
 *   - stage → status: when `status` is written (the user is picking a status).
 *   - status → sub-status: when `substatus` is written (previously never checked).
 * This rejects every invalid combination the request actively *introduces*,
 * without an unrelated edit (rename, stage move) tripping a rule on pre-existing
 * data. On create, all four are "written", so the full cascade runs.
 *
 * Returns the first violation, or null if valid.
 */
export function validateLeadPipelineCascade(args: {
  pipeline: PipelineConfig;
  source?: string | null;
  stage?: string | null;
  status?: string | null;
  substatus?: string | null;
  writing: { source?: boolean; stage?: boolean; status?: boolean; substatus?: boolean };
}): PipelineCascadeViolation | null {
  const { pipeline, source, stage, status, substatus, writing } = args;
  const rules = pipeline.dependentRules;

  if (writing.stage && stage && !pipeline.stages.includes(stage)) {
    return {
      field: "stage",
      message: "Invalid stage for this workspace.",
      errors: { stage: `Must be one of: ${pipeline.stages.join(", ")}` },
    };
  }
  if (writing.status && status && !pipeline.statuses.includes(status)) {
    return {
      field: "status",
      message: "Invalid status for this workspace.",
      errors: { status: `Must be one of: ${pipeline.statuses.join(", ")}` },
    };
  }
  if (writing.source && stage) {
    const allowed = allowedStagesForSource(rules, source);
    if (allowed.length > 0 && !allowed.includes(stage)) {
      return {
        field: "stage",
        message: "Stage is not allowed for this source.",
        errors: { stage: `Allowed for "${source}": ${allowed.join(", ")}` },
      };
    }
  }
  if (writing.status && status) {
    const allowed = allowedStatusesForStage(rules, stage);
    if (allowed.length > 0 && !allowed.includes(status)) {
      return {
        field: "status",
        message: "Status is not allowed for this stage.",
        errors: { status: `Allowed for "${stage}": ${allowed.join(", ")}` },
      };
    }
  }
  if (writing.substatus && substatus) {
    const allowed = allowedSubstatusesForStatus(rules, status);
    if (allowed.length > 0 && !allowed.includes(substatus)) {
      return {
        field: "substatus",
        message: "Sub-status is not allowed for this status.",
        errors: { substatus: `Allowed for "${status}": ${allowed.join(", ")}` },
      };
    }
  }
  return null;
}
