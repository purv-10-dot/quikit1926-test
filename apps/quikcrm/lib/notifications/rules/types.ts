/**
 * Notification Rules Engine — shared types.
 *
 * The rules engine runs AFTER existing hardcoded notifications.
 * It never replaces them — it only adds additional notifications
 * when admin-configured conditions match.
 */

// ─── Entity types ─────────────────────────────────────────────────────────────

export type EntityType = "lead" | "task" | "opportunity" | "quote" | "contact";

// ─── Condition types ──────────────────────────────────────────────────────────

export type ConditionType =
  | "entity_created"      // Entity was created
  | "entity_updated"      // Any field was updated
  | "entity_deleted"      // Entity was soft-deleted
  | "field_changed"       // Specific field changed (any value)
  | "field_equals"        // Field equals a specific value
  | "field_not_equals"    // Field does not equal a value
  | "field_contains"      // Field string contains value
  | "field_greater_than"  // Field numeric > value
  | "field_less_than";    // Field numeric < value

// ─── Recipient types ──────────────────────────────────────────────────────────

export type RecipientType =
  | "owner"           // The record's assigned owner
  | "manager"         // Users with SalesManager or Administrator role
  | "specific_user"   // A hardcoded userId (stored in recipientValue)
  | "specific_role";  // All users with a CRM role (stored in recipientValue)

// ─── Rule shape ───────────────────────────────────────────────────────────────

export interface NotificationRule {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  entityType: EntityType;
  fieldName: string | null;       // Which field to check (for field_* conditions)
  conditionType: ConditionType;
  conditionValue: string | null;  // The value to compare against
  notifyInApp: boolean;
  notifyEmail: boolean;
  recipientType: RecipientType;
  recipientValue: string | null;  // userId or role name for specific_* recipients
  messageTemplate: string;        // e.g. "Lead {{lead.name}} became {{lead.stage}}"
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Event context passed to the engine ──────────────────────────────────────

/**
 * Context object built by each route handler and passed to evaluateRulesForEvent().
 * The engine uses this to decide which rules match and how to render messages.
 */
export interface RuleEventContext {
  event: string;                        // 'created' | 'updated' | 'stage_changed' | 'converted' | 'deleted'
  entityType: EntityType;
  entityId: string;
  orgId: string;
  actorUserId: string;
  actorName: string;
  before?: Record<string, unknown>;     // Entity state before the change
  after?: Record<string, unknown>;      // Entity state after the change
  changedFields?: string[];             // Names of fields that changed
}

// ─── Field definitions per entity (for UI dropdowns) ─────────────────────────

export interface FieldOption {
  value: string;
  label: string;
}

export const ENTITY_FIELDS: Record<EntityType, FieldOption[]> = {
  lead: [
    { value: "stage", label: "Stage" },
    { value: "status", label: "Status" },
    { value: "score", label: "Score" },
    { value: "ownerId", label: "Owner" },
    { value: "source", label: "Source" },
    { value: "company", label: "Company" },
    { value: "country", label: "Country" },
    { value: "industry", label: "Industry" },
    { value: "followupPriority", label: "Follow-up Priority" },
    { value: "leadQuality", label: "Lead Quality" },
    { value: "isStarred", label: "Starred" },
  ],
  task: [
    { value: "status", label: "Status" },
    { value: "priority", label: "Priority" },
    { value: "taskType", label: "Task Type" },
    { value: "assignedToUserId", label: "Assigned To" },
    { value: "dueDate", label: "Due Date" },
    { value: "relatedKind", label: "Related Entity Type" },
  ],
  opportunity: [
    { value: "stage", label: "Stage" },
    { value: "amount", label: "Amount" },
    { value: "probability", label: "Probability" },
    { value: "currency", label: "Currency" },
    { value: "ownerId", label: "Owner" },
    { value: "closeDate", label: "Close Date" },
  ],
  quote: [
    { value: "status", label: "Status" },
    { value: "grandTotal", label: "Grand Total" },
    { value: "currency", label: "Currency" },
    { value: "ownerName", label: "Owner" },
  ],
  contact: [
    { value: "contactStage", label: "Stage" },
    { value: "source", label: "Source" },
    { value: "ownerId", label: "Owner" },
    { value: "accountId", label: "Account" },
    { value: "title", label: "Job Title" },
  ],
};

export const CONDITION_LABELS: Record<ConditionType, string> = {
  entity_created: "Is Created",
  entity_updated: "Is Updated",
  entity_deleted: "Is Deleted",
  field_changed: "Changes (any value)",
  field_equals: "Changes To",
  field_not_equals: "Is Not Equal To",
  field_contains: "Contains",
  field_greater_than: "Greater Than",
  field_less_than: "Less Than",
};

/** Generic fallback — only used when entity-specific labels aren't available. */
export const RECIPIENT_LABELS: Record<RecipientType, string> = {
  owner: "Record Owner",
  manager: "Sales Manager",
  specific_user: "Specific User",
  specific_role: "Specific Role",
};

/**
 * Per-entity recipient labels shown in the rule builder dropdown.
 * The "owner" label changes meaning per entity:
 *   lead        → lead owner (ownerId)
 *   task        → task assignee (assignedToUserId)
 *   opportunity → opportunity owner (ownerId)
 *   quote       → quote owner (ownerName — best-effort by name match)
 *   contact     → contact owner (ownerId)
 */
export const ENTITY_RECIPIENT_LABELS: Record<EntityType, Record<RecipientType, string>> = {
  lead: {
    owner: "Lead Owner",
    manager: "Sales Manager",
    specific_user: "Specific User",
    specific_role: "Specific Role",
  },
  task: {
    owner: "Task Assignee",
    manager: "Team Manager",
    specific_user: "Specific User",
    specific_role: "Specific Role",
  },
  opportunity: {
    owner: "Opportunity Owner",
    manager: "Sales Manager",
    specific_user: "Specific User",
    specific_role: "Specific Role",
  },
  quote: {
    owner: "Quote Owner",
    manager: "Sales Manager",
    specific_user: "Specific User",
    specific_role: "Specific Role",
  },
  contact: {
    owner: "Contact Owner",
    manager: "Account Manager",
    specific_user: "Specific User",
    specific_role: "Specific Role",
  },
};

/**
 * The DB field that holds the "owner" user ID for each entity type.
 * Used by the engine's recipient resolver.
 *   task → assignedToUserId  (the person the task is assigned to)
 *   all others → ownerId
 */
export const ENTITY_OWNER_FIELD: Record<EntityType, string> = {
  lead: "ownerId",
  task: "assignedToUserId",
  opportunity: "ownerId",
  quote: "ownerId",          // CrmQuote stores ownerName; engine falls back gracefully
  contact: "ownerId",
};

// Field-based conditions (require fieldName + conditionValue in the form).
export const FIELD_CONDITIONS: ConditionType[] = [
  "field_changed",
  "field_equals",
  "field_not_equals",
  "field_contains",
  "field_greater_than",
  "field_less_than",
];

// Conditions that need a conditionValue input.
export const VALUE_CONDITIONS: ConditionType[] = [
  "field_equals",
  "field_not_equals",
  "field_contains",
  "field_greater_than",
  "field_less_than",
];

// Template variables hint shown in the message editor.
export const TEMPLATE_VARS: Record<EntityType, string[]> = {
  lead: [
    "{{lead.name}}",
    "{{lead.stage}}",
    "{{lead.status}}",
    "{{lead.company}}",
    "{{lead.owner}}",
    "{{lead.email}}",
    "{{lead.source}}",
    "{{actor.name}}",
  ],
  task: [
    "{{task.subject}}",
    "{{task.status}}",
    "{{task.priority}}",
    "{{task.type}}",
    "{{task.dueDate}}",
    "{{actor.name}}",
  ],
  opportunity: [
    "{{opportunity.name}}",
    "{{opportunity.stage}}",
    "{{opportunity.amount}}",
    "{{opportunity.currency}}",
    "{{opportunity.probability}}",
    "{{opportunity.owner}}",
    "{{actor.name}}",
  ],
  quote: [
    "{{quote.number}}",
    "{{quote.status}}",
    "{{quote.total}}",
    "{{quote.currency}}",
    "{{quote.owner}}",
    "{{actor.name}}",
  ],
  contact: [
    "{{contact.name}}",
    "{{contact.email}}",
    "{{contact.phone}}",
    "{{contact.stage}}",
    "{{contact.owner}}",
    "{{actor.name}}",
  ],
};
