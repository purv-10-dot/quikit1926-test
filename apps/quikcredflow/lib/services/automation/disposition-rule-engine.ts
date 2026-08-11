/**
 * FR-D3: Flat trigger→action automation rule engine for call disposition events.
 *
 * Design constraints (settled, do not change without spec approval):
 *   - Evaluates rules synchronously after a call activity write, in sortOrder.
 *   - First-match-wins-and-stop for set_lead_status (max one status hop per event).
 *   - create_task and notify_owner fire for every matching rule.
 *   - A rule-made status change does NOT re-trigger this engine (no cascade) — the
 *     function does not call itself and is not re-invoked by the lead update.
 *   - FR-D5: every rule-made status change is audit-logged via QcfAuditLog with
 *     metadata.actor = "rule:<id>".
 *   - Condition 1: all disposition/status comparisons are case-insensitive + trimmed.
 *   - A missing or non-matching rule never blocks a save (no-op, no throw).
 */

import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { triggerOutboundSync } from "@/lib/services/leadsquared/outbound-trigger";
import { recordWriteAndCheck } from "@/lib/services/automation/loop-guard";
import { recordAttribution } from "@/lib/services/automation/attribution";

// ── Public call context ───────────────────────────────────────────────────────

export interface RunAfterActivityLoggedCtx {
  orgId: string;
  leadId: string;
  activityId: string;
  /** The QcfCallDisposition.code that the agent selected. */
  dispositionCode: string;
  /**
   * The user-entered occurrence time of the activity (FR-D2).
   * Until FR-D2 is wired end-to-end this will be the server `now` at save
   * time (QcfActivity.occurredAt). Used as the due date for create_task actions.
   */
  activityDatetime: Date;
  /** Lead owner — used as default assignee for create_task. */
  ownerId?: string | null;
}

// ── Internal trigger / action shapes ─────────────────────────────────────────

interface ActivityLoggedTrigger {
  type: "activity_logged";
  /** Only "call" is supported in v1. */
  activity_type?: string;
  /** Disposition code to match against. Compared case-insensitively + trimmed. */
  disposition: string;
}

interface SetLeadStatusAction {
  type: "set_lead_status";
  /** Target QcfLead.status value. Validated at rule-creation time. */
  status: string;
  /** Optional QcfLead.substatus value. */
  sub_status?: string;
}

interface CreateTaskAction {
  type: "create_task";
  /**
   * "activity_datetime" → use ctx.activityDatetime as dueDate.
   * Any other value → use server now.
   */
  due: "activity_datetime" | string;
  /** Supports {lead.name} template token. */
  title: string;
}

interface NotifyOwnerAction {
  type: "notify_owner";
}

type RuleAction = SetLeadStatusAction | CreateTaskAction | NotifyOwnerAction;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Condition 1: trim + lowercase before comparing any status/disposition string. */
function norm(s: string): string {
  return (s ?? "").trim().toLowerCase();
}

function triggerMatches(
  trigger: ActivityLoggedTrigger,
  ctx: RunAfterActivityLoggedCtx,
): boolean {
  if (trigger.type !== "activity_logged") return false;
  // activity_type defaults to "call" if omitted; only "call" is implemented in v1.
  if (trigger.activity_type && norm(trigger.activity_type) !== "call") return false;
  return norm(trigger.disposition) === norm(ctx.dispositionCode);
}

// ── Validation (called at rule-creation/save time) ────────────────────────────

/**
 * Validate that a set_lead_status action targets a status that actually exists
 * in the tenant's configured lead status list.  Throws with a clear message on
 * failure — a rule must never be saveable pointing at a non-existent status.
 */
export async function validateRuleAction(
  action: RuleAction,
): Promise<void> {
  if (action.type !== "set_lead_status") return;

  const target = action.status?.trim();
  if (!target) {
    throw new Error("set_lead_status action requires a non-empty status value.");
  }

  const exists = await prisma.qcfLeadStatus.findFirst({
    where: { name: { equals: target, mode: "insensitive" } },
  });
  if (!exists) {
    throw new Error(
      `Automation rule references status "${target}" which does not exist in the configured lead status list. ` +
        `Add that status under Settings > Lead Statuses before saving this rule.`,
    );
  }

  if (action.sub_status) {
    const subExists = await prisma.qcfLeadSubStatus.findFirst({
      where: { name: { equals: action.sub_status.trim(), mode: "insensitive" } },
    });
    if (!subExists) {
      throw new Error(
        `Automation rule references sub-status "${action.sub_status}" which does not exist. ` +
          `Add it under Settings > Lead Sub-Statuses first.`,
      );
    }
  }
}

// ── Main engine ───────────────────────────────────────────────────────────────

/**
 * FR-D3 / FR-D4 / FR-D5: Run active automation rules after a call activity
 * is logged.  Never throws — errors are logged so a rule failure never blocks
 * the disposition save.
 */
export async function runAfterActivityLogged(
  ctx: RunAfterActivityLoggedCtx,
): Promise<void> {
  try {
    await _runEngine(ctx);
  } catch (err) {
    console.error(
      "[disposition-rule-engine] error evaluating rules for lead",
      ctx.leadId,
      "disposition",
      ctx.dispositionCode,
      err instanceof Error ? err.message : String(err),
    );
  }
}

async function _runEngine(ctx: RunAfterActivityLoggedCtx): Promise<void> {
  const rules = await prisma.qcfAutomationRule.findMany({
    where: { orgId: ctx.orgId, isActive: true },
    orderBy: { sortOrder: "asc" },
  });

  if (rules.length === 0) return;

  // Read lead then make a local mutable copy so the engine's status-hop
  // bookkeeping never mutates the original DB object (or test mock return).
  const leadRecord = await prisma.qcfLead.findUnique({
    where: { id: ctx.leadId },
    select: { status: true, name: true, ownerId: true },
  });
  if (!leadRecord) return;
  const lead = { ...leadRecord };

  // first-match-wins-and-stop guard for set_lead_status (FR-D3: max one hop).
  let statusHopFired = false;

  for (const rule of rules) {
    const trigger = rule.trigger as unknown as ActivityLoggedTrigger;
    if (!triggerMatches(trigger, ctx)) continue;

    const action = rule.action as unknown as RuleAction;

    if (action.type === "set_lead_status") {
      if (statusHopFired) continue; // first-match-wins: subsequent set_lead_status skipped
      statusHopFired = true;

      const prevStatus = lead.status;
      const newStatus = action.status.trim();

      await prisma.qcfLead.update({
        where: { id: ctx.leadId },
        data: {
          status: newStatus,
          ...(action.sub_status ? { substatus: action.sub_status.trim() } : {}),
        },
      });
      // Outbound sync (status/substatus changed). Fire-and-forget.
      triggerOutboundSync({ orgId: ctx.orgId, crmLeadId: ctx.leadId });

      // Dual-engine loop guard (SPEC §6): a legacy-disposition status write
      // increments the SAME per-lead/day counter the workflow engine uses, so a
      // cross-engine ping-pong is caught below either engine's individual cap.
      // Best-effort — a guard failure must never block the disposition save.
      await recordWriteAndCheck({
        orgId: ctx.orgId,
        leadId: ctx.leadId,
        source: "legacy-disposition",
      }).catch((e) =>
        console.error("[disposition-rule-engine] loop-guard increment failed", e),
      );

      // Attribution (SPEC §8): distinguishable engine source so the same
      // "why did this lead change?" lookup covers legacy-disposition writes too.
      await recordAttribution({
        orgId: ctx.orgId,
        leadId: ctx.leadId,
        engineSource: "legacy-disposition",
        ruleId: rule.id,
        triggerEventId: ctx.activityId,
        triggerType: "activity_logged",
        field: "status",
        before: prevStatus,
        after: newStatus,
        snapshot: { status: prevStatus, name: lead.name },
      });

      // FR-D5: audit-log with rule as actor.
      await prisma.qcfAuditLog.create({
        data: {
          orgId: ctx.orgId,
          userId: null,
          module: "leads",
          action: "status_changed",
          resourceId: ctx.leadId,
          before: { status: prevStatus } as Prisma.InputJsonValue,
          after: { status: newStatus } as Prisma.InputJsonValue,
          metadata: {
            actor: `rule:${rule.id}`,
            ruleId: rule.id,
            ruleName: rule.name,
            activityId: ctx.activityId,
            field: "status",
          } as Prisma.InputJsonValue,
        },
      });

      // Keep local snapshot current so later rules see the updated status
      // if they branch on it (none do in v1, but guards against future reads).
      lead.status = newStatus;
    } else if (action.type === "create_task") {
      const dueDate =
        action.due === "activity_datetime" ? ctx.activityDatetime : new Date();
      const title = (action.title ?? "Follow up").replace(
        "{lead.name}",
        lead.name ?? "Lead",
      );

      await prisma.qcfTask.create({
        data: {
          orgId: ctx.orgId,
          subject: title,
          taskType: "FollowUp",
          priority: "Medium",
          status: "Open",
          dueDate,
          leadId: ctx.leadId,
          relatedKind: "Lead",
          relatedObjectId: ctx.leadId,
          assignedToUserId: ctx.ownerId ?? lead.ownerId ?? null,
        },
      });
    } else if (action.type === "notify_owner") {
      // TODO(FR-D3 notify_owner): wire to QcfNotification when notification
      // spec for system-actor events is confirmed.  No-op in v1.
    }
  }
}
