/**
 * Accounting Connectivity Platform — shared domain types.
 *
 * These types are provider-agnostic. The Sync/Migration engines depend ONLY on
 * these abstractions, never on a concrete provider — that is what lets us add
 * QuickBooks, Xero, Sage, NetSuite, etc. without touching engine code.
 */

export type ProviderKey = "zoho_books" | "tally_prime" | (string & {});

/** Every entity the platform can move between systems. */
export const ENTITY_TYPES = [
  "customers", "vendors", "products", "services", "inventory", "warehouses",
  "chart_of_accounts", "taxes", "invoices", "sales_orders", "purchase_orders",
  "bills", "credit_notes", "debit_notes", "expenses", "payments", "journals",
  "bank_accounts", "bank_transactions", "attachments", "custom_fields"
] as const;
export type EntityType = (typeof ENTITY_TYPES)[number];

export type SyncDirection = "pull" | "push" | "bidirectional";

export const SCHEDULES = [
  "manual", "realtime", "every_5_min", "every_15_min", "every_30_min",
  "hourly", "daily", "weekly", "monthly"
] as const;
export type Schedule = (typeof SCHEDULES)[number];

export type ConnectionStatus = "pending" | "connected" | "error" | "disabled" | "expired";

export type JobType = "sync" | "migration" | "pull" | "push" | "token_refresh";
export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "paused" | "cancelled" | "dead";

export type ConflictStrategy = "latest_wins" | "quikfinance_wins" | "external_wins" | "manual" | "merge";

/** Capabilities a provider advertises so the UI can adapt per provider. */
export type ProviderCapabilities = {
  oauth: boolean;
  webhooks: boolean;
  incremental: boolean;
  multiCompany: boolean;
  entities: EntityType[];
  directions: SyncDirection[];
};

export type ProviderDescriptor = {
  key: ProviderKey;
  name: string;
  authType: "oauth2" | "local";
  description: string;
  capabilities: ProviderCapabilities;
};

/** A single record pulled from / pushed to an external system, normalized. */
export type ExternalRecord = {
  externalId: string;
  /** Provider's last-modified marker, used for incremental detection. */
  modifiedAt?: string | null;
  /** Raw normalized payload (provider-shaped but plain JSON). */
  data: Record<string, unknown>;
  /** Soft-delete / restore signals from the provider, when known. */
  deleted?: boolean;
};

export type ChangeOp = "create" | "update" | "delete" | "restore";

export type RecordChange = {
  op: ChangeOp;
  entity: EntityType;
  externalId?: string;
  internalId?: string;
  data: Record<string, unknown>;
  hash: string;
};

export type PullResult = {
  entity: EntityType;
  records: ExternalRecord[];
  /** Opaque cursor for the next incremental pull (provider-specific). */
  nextCursor?: string | null;
  hasMore?: boolean;
};

export type PushResult = {
  entity: EntityType;
  created: number;
  updated: number;
  deleted: number;
  failures: Array<{ internalId?: string; error: string }>;
};

export type ProviderMetadata = {
  organizations: Array<{ id: string; name: string; currency?: string; country?: string }>;
  raw?: Record<string, unknown>;
};

export type HealthCheckResult = {
  ok: boolean;
  latencyMs: number;
  message: string;
  tokenExpiresAt?: string | null;
  details?: Record<string, unknown>;
};

export type ConnectResult = {
  /** For OAuth providers, the URL the browser must visit to grant access. */
  authorizationUrl?: string;
  status: ConnectionStatus;
  message: string;
};

export type SyncOptions = {
  /** Limit the run to these entities; omit for all configured entities. */
  entities?: EntityType[];
  /** Override the connection's per-entity direction. */
  direction?: SyncDirection;
  /** Force a full (non-incremental) pull. */
  full?: boolean;
};

/** Per-entity configuration stored on a connection's `settings` JSON. */
export type EntitySetting = {
  entity: EntityType;
  enabled: boolean;
  direction: SyncDirection;
  schedule: Schedule;
};

/** A field-level transformation rule. */
export type TransformRule =
  | { type: "none" }
  | { type: "uppercase" }
  | { type: "lowercase" }
  | { type: "trim" }
  | { type: "date_format"; from?: string; to: string }
  | { type: "default"; value: string }
  | { type: "concat"; with: string; separator?: string }
  | { type: "lookup"; map: Record<string, string> }
  | { type: "number" };

export type FieldMapping = {
  id?: string;
  entity: EntityType;
  sourceField: string;
  targetField: string;
  direction: SyncDirection;
  transform?: TransformRule | null;
  isCustom?: boolean;
  isCalculated?: boolean;
  enabled?: boolean;
};
