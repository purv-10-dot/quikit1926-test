/**
 * Notification Rules Engine.
 *
 * Runs AFTER existing hardcoded notifications — never replaces them.
 *
 * Supported entities: lead | task | opportunity | quote | contact
 *
 * Call evaluateRulesForEvent() from any route handler after the primary
 * business operation succeeds. It runs fire-and-forget so it never delays
 * the HTTP response. Lead notifications are completely unchanged.
 *
 * Event names by entity:
 *   lead:        created | updated | deleted | stage_changed | converted
 *   task:        created | updated | deleted | status_changed | assigned
 *   opportunity: created | updated | deleted | stage_changed | won | lost
 *   quote:       created | updated | deleted | status_changed | sent
 *   contact:     created | updated | deleted
 */

import { prisma } from "@/lib/db/prisma";
import { createNotification } from "@/lib/notifications/service";
import { getActiveRulesForEntity } from "./db";
import type { NotificationRule, RuleEventContext, EntityType } from "./types";
import { FIELD_CONDITIONS, VALUE_CONDITIONS, ENTITY_OWNER_FIELD } from "./types";

// ─── Main entry point ─────────────────────────────────────────────────────────

/**
 * Evaluate all active rules for an entity event.
 * Always called fire-and-forget from route handlers:
 *
 * @example
 * evaluateRulesForEvent({ event: 'created', entityType: 'task', ... })
 *   .catch(err => console.error('[rules-engine]', err));
 */
export async function evaluateRulesForEvent(ctx: RuleEventContext): Promise<void> {
  let rules: NotificationRule[];
  try {
    rules = await getActiveRulesForEntity(ctx.orgId, ctx.entityType);
  } catch (err) {
    if (isTableMissingError(err)) return; // Table not set up yet — skip silently.
    throw err;
  }

  if (rules.length === 0) return;

  for (const rule of rules) {
    try {
      if (!matchesCondition(rule, ctx)) continue;

      const recipientIds = await resolveRecipients(rule, ctx);
      if (recipientIds.length === 0) continue;

      const title = renderTemplate(rule.messageTemplate, ctx);
      const body = buildBody(rule, ctx);
      const link = buildLink(ctx);

      for (const userId of recipientIds) {
        await createNotification({
          orgId: ctx.orgId,
          userId,
          type: pickNotificationType(ctx.entityType),
          category: ctx.entityType as "lead",
          title,
          body,
          link,
          skipEmail: !rule.notifyEmail,
          metadata: {
            type: `rule_${ctx.entityType}_${ctx.event}`,
            ruleId: rule.id,
            ruleName: rule.name,
            entityId: ctx.entityId,
            entityType: ctx.entityType,
            event: ctx.event,
          },
        });
      }
    } catch (err) {
      console.error(
        `[rules-engine] rule ${rule.id} ("${rule.name}") on ${ctx.entityType}.${ctx.event} failed:`,
        err instanceof Error ? err.message : String(err),
      );
    }
  }
}

// ─── Condition evaluation ─────────────────────────────────────────────────────

function matchesCondition(rule: NotificationRule, ctx: RuleEventContext): boolean {
  const { conditionType, fieldName, conditionValue } = rule;
  const afterVal = fieldName ? String(ctx.after?.[fieldName] ?? "") : "";
  const condVal = conditionValue ?? "";

  switch (conditionType) {
    case "entity_created":
      return ctx.event === "created";

    case "entity_updated":
      // Matches any mutation event across all entities.
      return [
        "updated",
        // Lead
        "stage_changed", "converted", "restored",
        // Task
        "status_changed", "assigned",
        // Opportunity
        "won", "lost",
        // Quote
        "sent", "approved", "rejected",
      ].includes(ctx.event);

    case "entity_deleted":
      return ctx.event === "deleted";

    case "field_changed":
      return Boolean(fieldName) && (ctx.changedFields ?? []).includes(fieldName!);

    case "field_equals":
      return afterVal.toLowerCase() === condVal.toLowerCase();

    case "field_not_equals":
      return afterVal.toLowerCase() !== condVal.toLowerCase();

    case "field_contains":
      return afterVal.toLowerCase().includes(condVal.toLowerCase());

    case "field_greater_than": {
      const n = Number(afterVal);
      return Number.isFinite(n) && n > Number(condVal);
    }

    case "field_less_than": {
      const n = Number(afterVal);
      return Number.isFinite(n) && n < Number(condVal);
    }

    default:
      return false;
  }
}

// ─── Recipient resolution ─────────────────────────────────────────────────────

async function resolveRecipients(
  rule: NotificationRule,
  ctx: RuleEventContext,
): Promise<string[]> {
  switch (rule.recipientType) {
    case "owner": {
      // Entity-specific owner field (task → assignedToUserId, others → ownerId).
      const ownerField = ENTITY_OWNER_FIELD[ctx.entityType] ?? "ownerId";
      const ownerId = String(ctx.after?.[ownerField] ?? ctx.before?.[ownerField] ?? "").trim();
      if (!ownerId || ownerId === ctx.actorUserId) return [];
      return [ownerId];
    }

    case "manager": {
      const members = await prisma.orgMember.findMany({
        where: {
          orgId: ctx.orgId,
          status: "active",
          role: {
            in: [
              "manager", "admin", "org_admin",
              "SalesManager", "Administrator",
            ],
          },
        },
        select: { userId: true },
      });
      return members
        .map((m) => m.userId)
        .filter((id) => id !== ctx.actorUserId);
    }

    case "specific_user": {
      const uid = rule.recipientValue?.trim();
      if (!uid || uid === ctx.actorUserId) return [];
      return [uid];
    }

    case "specific_role": {
      const role = rule.recipientValue?.trim();
      if (!role) return [];
      const members = await prisma.orgMember.findMany({
        where: { orgId: ctx.orgId, role, status: "active" },
        select: { userId: true },
      });
      return members
        .map((m) => m.userId)
        .filter((id) => id !== ctx.actorUserId);
    }

    default:
      return [];
  }
}

// ─── Template rendering ───────────────────────────────────────────────────────

/**
 * Replaces {{variable}} placeholders with entity context values.
 * Supports all five entity types. Unknown keys are left as-is.
 */
function renderTemplate(template: string, ctx: RuleEventContext): string {
  const a = ctx.after ?? {};
  const b = ctx.before ?? {};
  const pick = (key: string) => String(a[key] ?? b[key] ?? "");

  const vars: Record<string, string> = {
    // Generic
    "actor.name":  ctx.actorName,
    "entity.id":   ctx.entityId,
    "entity.type": ctx.entityType,
    // ── Lead
    "lead.name":    pick("name"),
    "lead.stage":   pick("stage"),
    "lead.status":  pick("status"),
    "lead.company": pick("company"),
    "lead.owner":   pick("ownerName"),
    "lead.email":   pick("email"),
    "lead.source":  pick("source"),
    // ── Task
    "task.subject":  pick("subject"),
    "task.status":   pick("status"),
    "task.priority": pick("priority"),
    "task.type":     pick("taskType"),
    "task.dueDate":  pick("dueDate"),
    // ── Opportunity
    "opportunity.name":        pick("name"),
    "opportunity.stage":       pick("stage"),
    "opportunity.amount":      pick("amount"),
    "opportunity.currency":    pick("currency"),
    "opportunity.probability": pick("probability"),
    "opportunity.owner":       pick("ownerName"),
    // ── Quote
    "quote.number":   pick("quoteNumber"),
    "quote.status":   pick("status"),
    "quote.total":    pick("grandTotal"),
    "quote.currency": pick("currency"),
    "quote.owner":    pick("ownerName"),
    // ── Contact
    "contact.name":  [pick("firstName"), pick("lastName")].filter(Boolean).join(" "),
    "contact.email": pick("email"),
    "contact.phone": pick("phone"),
    "contact.stage": pick("contactStage"),
    "contact.owner": pick("ownerName"),
  };

  return template.replace(
    /\{\{([\w.]+)\}\}/g,
    (_, key: string) => vars[key] ?? `{{${key}}}`,
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function buildBody(rule: NotificationRule, ctx: RuleEventContext): string {
  const name =
    ctx.after?.name ??
    ctx.after?.subject ??     // task
    ctx.after?.quoteNumber ?? // quote
    ctx.entityId;
  return `Rule "${rule.name}" matched on ${ctx.entityType} "${String(name ?? ctx.entityId)}".`;
}

function buildLink(ctx: RuleEventContext): string {
  switch (ctx.entityType) {
    case "lead":         return `/leads/${ctx.entityId}`;
    case "task":         return `/tasks`;
    case "opportunity":  return `/opportunities/${ctx.entityId}`;
    case "quote":        return `/quotes/${ctx.entityId}`;
    case "contact":      return `/contacts/${ctx.entityId}`;
    default:             return "/";
  }
}

/**
 * Map entity type to the closest existing notification type so the UI icon
 * resolver in notification-item.tsx shows a reasonable icon.
 */
function pickNotificationType(
  entityType: EntityType,
): "lead_assigned" | "lead_stage_changed" | "lead_converted" | "lead_reassigned" {
  switch (entityType) {
    case "lead":        return "lead_stage_changed";
    case "task":        return "lead_assigned";
    case "opportunity": return "lead_converted";
    case "quote":       return "lead_stage_changed";
    case "contact":     return "lead_reassigned";
    default:            return "lead_stage_changed";
  }
}

// ─── Error detection ──────────────────────────────────────────────────────────

function isTableMissingError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  return (
    msg.includes("does not exist") ||
    msg.includes("relation") ||
    msg.includes("crm_notification_rule")
  );
}
