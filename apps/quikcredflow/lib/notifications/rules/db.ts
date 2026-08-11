/**
 * Notification Rules — raw SQL data-access layer.
 *
 * The CrmNotificationRule table lives in app_quikcrm schema and is managed via
 * raw SQL because it was added after the shared Prisma schema was locked.
 * All queries use parameterised tagged-template literals (Prisma.$queryRaw /
 * $executeRaw) to prevent injection.
 *
 * Auto-migration: every exported function calls ensureTable() before executing
 * its query. ensureTable() is idempotent (CREATE TABLE IF NOT EXISTS) and uses
 * TWO separate $executeRawUnsafe calls — Prisma rejects multi-statement strings,
 * so the CREATE TABLE and CREATE INDEX must be sent as separate round-trips.
 */

import { prisma } from "@/lib/db/prisma";
import type {
  NotificationRule,
  EntityType,
  ConditionType,
  RecipientType,
} from "./types";

// ─── Auto-migration guard ─────────────────────────────────────────────────────

/**
 * Module-level flag. In Next.js dev/Node processes the module is cached across
 * requests, so this avoids re-running CREATE TABLE on every call. In ephemeral
 * serverless environments it resets per invocation — harmless, since
 * `CREATE TABLE IF NOT EXISTS` is cheap and idempotent.
 */
let _tableReady = false;

/**
 * Ensure the crm_notification_rule table exists.
 *
 * Two separate $executeRawUnsafe calls — one for the table, one for the index.
 * Prisma's raw query driver does NOT support multiple semicolon-delimited
 * statements in a single call; sending both in one string causes `42P01` on the
 * INSERT that follows because the CREATE quietly fails.
 */
export async function ensureTableExists(): Promise<void> {
  if (_tableReady) return;

  // Statement 1: table
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS app_quikcredflow.crm_notification_rule (
      id               TEXT         PRIMARY KEY DEFAULT gen_random_uuid()::text,
      org_id        TEXT         NOT NULL,
      name             VARCHAR(200) NOT NULL,
      description      TEXT,
      entity_type      VARCHAR(50)  NOT NULL DEFAULT 'lead',
      field_name       VARCHAR(100),
      condition_type   VARCHAR(50)  NOT NULL,
      condition_value  TEXT,
      notify_in_app    BOOLEAN      NOT NULL DEFAULT TRUE,
      notify_email     BOOLEAN      NOT NULL DEFAULT FALSE,
      recipient_type   VARCHAR(50)  NOT NULL DEFAULT 'owner',
      recipient_value  TEXT,
      message_template TEXT         NOT NULL,
      is_active        BOOLEAN      NOT NULL DEFAULT TRUE,
      created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW()
    )
  `);

  // Statement 2: index (separate call — see note above)
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS idx_crm_notification_rule_lookup
      ON app_quikcredflow.crm_notification_rule(org_id, entity_type, is_active)
  `);

  _tableReady = true;
}

// ─── Row → domain mapper ──────────────────────────────────────────────────────

interface RuleRow {
  id: string;
  org_id: string;
  name: string;
  description: string | null;
  entity_type: string;
  field_name: string | null;
  condition_type: string;
  condition_value: string | null;
  notify_in_app: boolean;
  notify_email: boolean;
  recipient_type: string;
  recipient_value: string | null;
  message_template: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

function toRule(row: RuleRow): NotificationRule {
  return {
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    description: row.description,
    entityType: row.entity_type as EntityType,
    fieldName: row.field_name,
    conditionType: row.condition_type as ConditionType,
    conditionValue: row.condition_value,
    notifyInApp: row.notify_in_app,
    notifyEmail: row.notify_email,
    recipientType: row.recipient_type as RecipientType,
    recipientValue: row.recipient_value,
    messageTemplate: row.message_template,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function listRules(orgId: string): Promise<NotificationRule[]> {
  await ensureTableExists();
  const rows = await prisma.$queryRaw<RuleRow[]>`
    SELECT * FROM app_quikcredflow.crm_notification_rule
    WHERE org_id = ${orgId}
    ORDER BY created_at DESC
  `;
  return rows.map(toRule);
}

export async function getActiveRulesForEntity(
  orgId: string,
  entityType: EntityType,
): Promise<NotificationRule[]> {
  await ensureTableExists();
  const rows = await prisma.$queryRaw<RuleRow[]>`
    SELECT * FROM app_quikcredflow.crm_notification_rule
    WHERE org_id = ${orgId}
      AND entity_type = ${entityType}
      AND is_active = TRUE
    ORDER BY created_at ASC
  `;
  return rows.map(toRule);
}

export async function getRuleById(
  orgId: string,
  id: string,
): Promise<NotificationRule | null> {
  await ensureTableExists();
  const rows = await prisma.$queryRaw<RuleRow[]>`
    SELECT * FROM app_quikcredflow.crm_notification_rule
    WHERE id = ${id} AND org_id = ${orgId}
    LIMIT 1
  `;
  return rows[0] ? toRule(rows[0]) : null;
}

export interface CreateRuleInput {
  orgId: string;
  name: string;
  description?: string | null;
  entityType: EntityType;
  fieldName?: string | null;
  conditionType: ConditionType;
  conditionValue?: string | null;
  notifyInApp: boolean;
  notifyEmail: boolean;
  recipientType: RecipientType;
  recipientValue?: string | null;
  messageTemplate: string;
  isActive?: boolean;
}

export async function createRule(input: CreateRuleInput): Promise<NotificationRule> {
  await ensureTableExists();
  const rows = await prisma.$queryRaw<RuleRow[]>`
    INSERT INTO app_quikcredflow.crm_notification_rule
      (org_id, name, description, entity_type, field_name, condition_type,
       condition_value, notify_in_app, notify_email, recipient_type,
       recipient_value, message_template, is_active)
    VALUES
      (${input.orgId}, ${input.name}, ${input.description ?? null},
       ${input.entityType}, ${input.fieldName ?? null}, ${input.conditionType},
       ${input.conditionValue ?? null}, ${input.notifyInApp}, ${input.notifyEmail},
       ${input.recipientType}, ${input.recipientValue ?? null},
       ${input.messageTemplate}, ${input.isActive ?? true})
    RETURNING *
  `;
  const row = rows[0];
  if (!row) throw new Error("Rule insert returned no row");
  return toRule(row);
}

export interface UpdateRuleInput {
  name?: string;
  description?: string | null;
  entityType?: EntityType;
  fieldName?: string | null;
  conditionType?: ConditionType;
  conditionValue?: string | null;
  notifyInApp?: boolean;
  notifyEmail?: boolean;
  recipientType?: RecipientType;
  recipientValue?: string | null;
  messageTemplate?: string;
  isActive?: boolean;
}

export async function updateRule(
  orgId: string,
  id: string,
  input: UpdateRuleInput,
): Promise<NotificationRule | null> {
  const existing = await getRuleById(orgId, id); // ensureTableExists called inside
  if (!existing) return null;

  const merged = {
    name:            input.name            ?? existing.name,
    description:     "description"   in input ? input.description  : existing.description,
    entityType:      input.entityType      ?? existing.entityType,
    fieldName:       "fieldName"      in input ? input.fieldName    : existing.fieldName,
    conditionType:   input.conditionType   ?? existing.conditionType,
    conditionValue:  "conditionValue" in input ? input.conditionValue : existing.conditionValue,
    notifyInApp:     input.notifyInApp     ?? existing.notifyInApp,
    notifyEmail:     input.notifyEmail     ?? existing.notifyEmail,
    recipientType:   input.recipientType   ?? existing.recipientType,
    recipientValue:  "recipientValue" in input ? input.recipientValue : existing.recipientValue,
    messageTemplate: input.messageTemplate ?? existing.messageTemplate,
    isActive:        input.isActive        ?? existing.isActive,
  };

  const rows = await prisma.$queryRaw<RuleRow[]>`
    UPDATE app_quikcredflow.crm_notification_rule
    SET name             = ${merged.name},
        description      = ${merged.description},
        entity_type      = ${merged.entityType},
        field_name       = ${merged.fieldName},
        condition_type   = ${merged.conditionType},
        condition_value  = ${merged.conditionValue},
        notify_in_app    = ${merged.notifyInApp},
        notify_email     = ${merged.notifyEmail},
        recipient_type   = ${merged.recipientType},
        recipient_value  = ${merged.recipientValue},
        message_template = ${merged.messageTemplate},
        is_active        = ${merged.isActive},
        updated_at       = NOW()
    WHERE id = ${id} AND org_id = ${orgId}
    RETURNING *
  `;
  return rows[0] ? toRule(rows[0]) : null;
}

export async function deleteRule(orgId: string, id: string): Promise<boolean> {
  await ensureTableExists();
  await prisma.$executeRaw`
    DELETE FROM app_quikcredflow.crm_notification_rule
    WHERE id = ${id} AND org_id = ${orgId}
  `;
  return true;
}

export async function toggleRuleActive(
  orgId: string,
  id: string,
  isActive: boolean,
): Promise<NotificationRule | null> {
  await ensureTableExists();
  const rows = await prisma.$queryRaw<RuleRow[]>`
    UPDATE app_quikcredflow.crm_notification_rule
    SET is_active  = ${isActive},
        updated_at = NOW()
    WHERE id = ${id} AND org_id = ${orgId}
    RETURNING *
  `;
  return rows[0] ? toRule(rows[0]) : null;
}

export async function countRules(orgId: string): Promise<number> {
  await ensureTableExists();
  const rows = await prisma.$queryRaw<[{ count: bigint }]>`
    SELECT COUNT(*) as count FROM app_quikcredflow.crm_notification_rule
    WHERE org_id = ${orgId}
  `;
  return Number(rows[0]?.count ?? 0);
}
