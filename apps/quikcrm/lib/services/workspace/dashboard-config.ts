/**
 * Dashboard-specific workspace settings, stored alongside the lead pipeline
 * config in CrmOrgWorkspaceSettings.settings.dashboard.
 *
 * Shape:
 *   {
 *     qualifiedStages: string[],   // P2.5 — drives conversion %
 *     funnelStages:   string[],    // P2.6 — ordered list, top to bottom
 *   }
 *
 * Settings UI is intentionally out of scope for the dashboard PR; defaults are
 * seeded on first read so the UI always has something sensible to show.
 */

import { prisma } from "@/lib/db/prisma";
import { getPipelineConfig } from "./pipeline-config";

export const DEFAULT_QUALIFIED_STAGES = [
  "Qualified",
  "Demo Scheduled",
  "Demo Completed",
  "Payment Link Sent",
  "Payment Done",
];

export interface DashboardConfig {
  qualifiedStages: string[];
  funnelStages: string[];
}

interface SettingsTree {
  dashboard?: Partial<DashboardConfig>;
  [k: string]: unknown;
}

export async function getDashboardConfig(orgId: string): Promise<DashboardConfig> {
  const row = await prisma.crmOrgWorkspaceSettings.findUnique({ where: { orgId } });
  const tree = ((row?.settings as SettingsTree | null) ?? {}) as SettingsTree;
  const cfg = tree.dashboard ?? {};

  const qualifiedStages =
    Array.isArray(cfg.qualifiedStages) && cfg.qualifiedStages.length > 0
      ? cfg.qualifiedStages
      : DEFAULT_QUALIFIED_STAGES;

  let funnelStages: string[];
  if (Array.isArray(cfg.funnelStages) && cfg.funnelStages.length > 0) {
    funnelStages = cfg.funnelStages;
  } else {
    const pipeline = await getPipelineConfig(orgId);
    funnelStages = pipeline.stages;
  }

  return { qualifiedStages, funnelStages };
}
