import type { CrmLead as Lead } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { evalCondition } from "@/lib/services/automation/conditions";
import type { DistributeConfig } from "@/types/workflow";

/**
 * Round-robin user picker for the `distribute_lead` workflow node.
 * Atomic increment via Prisma `update({ where: unique, data: { lastIndex: { increment: 1 } } })`.
 *
 * Port of automation-engine.service.ts::distributeLead behavior.
 */
export async function pickNextUser(opts: {
  tenantId: string;
  workflowId: string;
  nodeId: string;
  candidateUserIds: string[];
}): Promise<string | null> {
  if (opts.candidateUserIds.length === 0) return null;

  // Upsert the state row, then atomically increment & read in one call
  const state = await prisma.crmAutomationDistributionState.upsert({
    where: {
      tenantId_workflowId_nodeId: {
        tenantId: opts.tenantId,
        workflowId: opts.workflowId,
        nodeId: opts.nodeId,
      },
    },
    create: {
      tenantId: opts.tenantId,
      workflowId: opts.workflowId,
      nodeId: opts.nodeId,
      lastIndex: 0,
    },
    update: { lastIndex: { increment: 1 } },
  });
  const idx = state.lastIndex % opts.candidateUserIds.length;
  return opts.candidateUserIds[idx] ?? null;
}

/**
 * [P3.B3] Resolve which candidate pool a lead is assigned from (SPEC §5.4).
 *
 * Rule form: evaluate `rules` in order, FIRST match wins (each rule's
 * `conditions` are an AND group; an empty group is a catch-all). If no rule
 * matches, fall back to the MANDATORY `defaultUserIds`. Legacy flat form: the
 * single `candidateUserIds` pool. Round-robin (pickNextUser) remains the
 * within-pool mechanism.
 *
 * Returns the chosen pool plus a stable `ruleKey` the caller appends to the node
 * id so each rule/default keeps its OWN round-robin cursor
 * (CrmAutomationDistributionState is keyed by tenant+workflow+nodeId). The legacy
 * flat form returns ruleKey "" so its cursor stays on the bare node id (no reset
 * for pre-B3 definitions). Returns null when nothing is assignable (no rule
 * matched AND no/empty default) — the caller then leaves the owner unchanged.
 */
export function resolveAssignment(
  lead: Lead,
  cfg: DistributeConfig,
): { candidateUserIds: string[]; ruleKey: string } | null {
  if (Array.isArray(cfg.rules) && cfg.rules.length > 0) {
    for (let i = 0; i < cfg.rules.length; i++) {
      const rule = cfg.rules[i]!;
      const conds = rule.conditions ?? [];
      const matches = conds.length === 0 ? true : conds.every((c) => evalCondition(lead, c));
      if (matches && Array.isArray(rule.candidateUserIds) && rule.candidateUserIds.length > 0) {
        return { candidateUserIds: rule.candidateUserIds, ruleKey: `rule${i}` };
      }
    }
    // No rule matched → mandatory default pool.
    if (Array.isArray(cfg.defaultUserIds) && cfg.defaultUserIds.length > 0) {
      return { candidateUserIds: cfg.defaultUserIds, ruleKey: "default" };
    }
    return null;
  }

  // Legacy flat form (pre-B3): a single round-robin pool on the bare node id.
  if (Array.isArray(cfg.candidateUserIds) && cfg.candidateUserIds.length > 0) {
    return { candidateUserIds: cfg.candidateUserIds, ruleKey: "" };
  }
  return null;
}
