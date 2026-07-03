import type { PrismaClient } from "@prisma/client";
import { encryptSecret, decryptSecret } from "./secrets";
import { isEmailConfigured, sendEmail, emailHtml } from "@/lib/email/mailer";
import type { ProviderContext, TokenSet } from "./provider";
import type {
  ConnectionStatus, EntityType, FieldMapping, JobStatus, JobType, Schedule, SyncDirection
} from "./types";

type Row = Record<string, unknown>;

/**
 * IntegrationRepository — the only place that touches the integration_* tables.
 * Engines and APIs depend on this interface, not on SQL. Org-scoped on
 * construction; all queries are parameterized and cast explicitly.
 */
export class IntegrationRepository {
  constructor(private prisma: PrismaClient, private orgId: string, private userId?: string) {}

  // --- Providers catalog ----------------------------------------------------
  async listProviders(): Promise<Row[]> {
    return (await this.prisma.$queryRaw`
      SELECT key, name, auth_type, capabilities, is_active FROM integration_providers WHERE is_active = true ORDER BY name
    `) as Row[];
  }

  // --- Connections ----------------------------------------------------------
  async createConnection(input: {
    providerKey: string; name: string; region?: string | null; config?: Row; settings?: Row;
    defaultDirection?: SyncDirection; schedule?: Schedule;
  }): Promise<Row> {
    const rows = (await this.prisma.$queryRaw`
      INSERT INTO integration_connections (org_id, provider_key, name, region, config, settings, default_direction, schedule, created_by)
      VALUES (${this.orgId}::uuid, ${input.providerKey}, ${input.name}, ${input.region ?? null},
              ${JSON.stringify(input.config ?? {})}::jsonb, ${JSON.stringify(input.settings ?? {})}::jsonb,
              ${input.defaultDirection ?? "bidirectional"}, ${input.schedule ?? "manual"}, ${this.userId ?? null}::uuid)
      RETURNING *
    `) as Row[];
    return rows[0];
  }

  async getConnection(id: string): Promise<Row | null> {
    const rows = (await this.prisma.$queryRaw`
      SELECT * FROM integration_connections WHERE id = ${id}::uuid AND org_id = ${this.orgId}::uuid LIMIT 1
    `) as Row[];
    return rows[0] ?? null;
  }

  async listConnections(): Promise<Row[]> {
    return (await this.prisma.$queryRaw`
      SELECT * FROM integration_connections WHERE org_id = ${this.orgId}::uuid ORDER BY created_at DESC
    `) as Row[];
  }

  async updateConnection(id: string, patch: Partial<{
    status: ConnectionStatus; region: string | null; external_org_id: string | null; company_name: string | null;
    config: Row; settings: Row; default_direction: SyncDirection; schedule: Schedule; is_enabled: boolean;
    health_score: number; last_sync_at: string | null; last_error: string | null;
  }>): Promise<void> {
    // Build a JSON merge patch applied in one statement (keeps it simple + safe).
    await this.prisma.$executeRaw`
      UPDATE integration_connections SET
        status = COALESCE(${patch.status ?? null}, status),
        region = COALESCE(${patch.region ?? null}, region),
        external_org_id = COALESCE(${patch.external_org_id ?? null}, external_org_id),
        company_name = COALESCE(${patch.company_name ?? null}, company_name),
        config = COALESCE(${patch.config ? JSON.stringify(patch.config) : null}::jsonb, config),
        settings = COALESCE(${patch.settings ? JSON.stringify(patch.settings) : null}::jsonb, settings),
        default_direction = COALESCE(${patch.default_direction ?? null}, default_direction),
        schedule = COALESCE(${patch.schedule ?? null}, schedule),
        is_enabled = COALESCE(${patch.is_enabled ?? null}, is_enabled),
        health_score = COALESCE(${patch.health_score ?? null}, health_score),
        last_sync_at = COALESCE(${patch.last_sync_at ?? null}::timestamptz, last_sync_at),
        last_error = ${patch.last_error === undefined ? null : patch.last_error},
        updated_at = now()
      WHERE id = ${id}::uuid AND org_id = ${this.orgId}::uuid
    `;
  }

  async deleteConnection(id: string): Promise<void> {
    await this.prisma.$executeRaw`DELETE FROM integration_connections WHERE id = ${id}::uuid AND org_id = ${this.orgId}::uuid`;
  }

  // --- Credentials (encrypted) ---------------------------------------------
  async setCredentials(connectionId: string, creds: Record<string, string>): Promise<void> {
    for (const [key, value] of Object.entries(creds)) {
      if (value == null || value === "") continue;
      const enc = encryptSecret(value);
      await this.prisma.$executeRaw`
        INSERT INTO integration_credentials (connection_id, org_id, key, value_enc)
        VALUES (${connectionId}::uuid, ${this.orgId}::uuid, ${key}, ${enc})
        ON CONFLICT (connection_id, key) DO UPDATE SET value_enc = EXCLUDED.value_enc, updated_at = now()
      `;
    }
  }

  async getCredentials(connectionId: string): Promise<Record<string, string>> {
    const rows = (await this.prisma.$queryRaw`
      SELECT key, value_enc FROM integration_credentials WHERE connection_id = ${connectionId}::uuid AND org_id = ${this.orgId}::uuid
    `) as Array<{ key: string; value_enc: string }>;
    const out: Record<string, string> = {};
    for (const r of rows) {
      const dec = decryptSecret(r.value_enc);
      if (dec != null) out[r.key] = dec;
    }
    return out;
  }

  // --- Tokens (encrypted) ---------------------------------------------------
  async saveTokens(connectionId: string, tokens: TokenSet): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO integration_tokens (connection_id, org_id, access_token_enc, refresh_token_enc, token_type, scope, expires_at)
      VALUES (${connectionId}::uuid, ${this.orgId}::uuid, ${encryptSecret(tokens.accessToken)}, ${encryptSecret(tokens.refreshToken)},
              ${tokens.tokenType ?? null}, ${tokens.scope ?? null}, ${tokens.expiresAt ?? null}::timestamptz)
      ON CONFLICT (connection_id) DO UPDATE SET
        access_token_enc = EXCLUDED.access_token_enc,
        refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, integration_tokens.refresh_token_enc),
        token_type = EXCLUDED.token_type, scope = EXCLUDED.scope, expires_at = EXCLUDED.expires_at, updated_at = now()
    `;
  }

  async getTokens(connectionId: string): Promise<TokenSet | null> {
    const rows = (await this.prisma.$queryRaw`
      SELECT * FROM integration_tokens WHERE connection_id = ${connectionId}::uuid AND org_id = ${this.orgId}::uuid LIMIT 1
    `) as Row[];
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      accessToken: decryptSecret(r.access_token_enc as string),
      refreshToken: decryptSecret(r.refresh_token_enc as string),
      tokenType: (r.token_type as string) ?? null,
      scope: (r.scope as string) ?? null,
      expiresAt: r.expires_at ? new Date(r.expires_at as string).toISOString() : null
    };
  }

  /** Assemble a ProviderContext for a connection (decrypts creds + tokens). */
  async buildProviderContext(connectionId: string, logger?: ProviderContext["log"]): Promise<ProviderContext> {
    const conn = await this.getConnection(connectionId);
    if (!conn) throw new Error("Connection not found.");
    const credentials = await this.getCredentials(connectionId);
    const tokens = await this.getTokens(connectionId);
    return {
      connectionId,
      orgId: this.orgId,
      region: (conn.region as string) ?? null,
      externalOrgId: (conn.external_org_id as string) ?? null,
      config: (conn.config as Record<string, unknown>) ?? {},
      credentials,
      tokens,
      saveTokens: (t) => this.saveTokens(connectionId, t),
      log: logger ?? (() => {})
    };
  }

  // --- Jobs + queue ---------------------------------------------------------
  async enqueueJob(input: { connectionId: string; type: JobType; entity?: EntityType | null; direction?: SyncDirection | null; payload?: Row; priority?: number; maxAttempts?: number; scheduledAt?: string | null }): Promise<Row> {
    const rows = (await this.prisma.$queryRaw`
      INSERT INTO integration_jobs (org_id, connection_id, type, entity, direction, payload, priority, max_attempts, scheduled_at)
      VALUES (${this.orgId}::uuid, ${input.connectionId}::uuid, ${input.type}, ${input.entity ?? null}, ${input.direction ?? null},
              ${JSON.stringify(input.payload ?? {})}::jsonb, ${input.priority ?? 5}, ${input.maxAttempts ?? 3}, COALESCE(${input.scheduledAt ?? null}::timestamptz, now()))
      RETURNING *
    `) as Row[];
    return rows[0];
  }

  async getJob(id: string): Promise<Row | null> {
    const rows = (await this.prisma.$queryRaw`SELECT * FROM integration_jobs WHERE id = ${id}::uuid AND org_id = ${this.orgId}::uuid LIMIT 1`) as Row[];
    return rows[0] ?? null;
  }

  async listJobs(connectionId?: string, status?: JobStatus, limit = 50): Promise<Row[]> {
    if (connectionId && status) {
      return (await this.prisma.$queryRaw`SELECT * FROM integration_jobs WHERE org_id = ${this.orgId}::uuid AND connection_id = ${connectionId}::uuid AND status = ${status} ORDER BY created_at DESC LIMIT ${limit}`) as Row[];
    }
    if (connectionId) {
      return (await this.prisma.$queryRaw`SELECT * FROM integration_jobs WHERE org_id = ${this.orgId}::uuid AND connection_id = ${connectionId}::uuid ORDER BY created_at DESC LIMIT ${limit}`) as Row[];
    }
    return (await this.prisma.$queryRaw`SELECT * FROM integration_jobs WHERE org_id = ${this.orgId}::uuid ORDER BY created_at DESC LIMIT ${limit}`) as Row[];
  }

  /** Atomically claim queued jobs using SKIP LOCKED (safe for parallel workers). */
  async claimJobs(worker: string, limit = 5): Promise<Row[]> {
    return (await this.prisma.$queryRaw`
      UPDATE integration_jobs SET status = 'running', locked_by = ${worker}, locked_at = now(), started_at = now(), attempts = attempts + 1
      WHERE id IN (
        SELECT id FROM integration_jobs
        WHERE org_id = ${this.orgId}::uuid AND status = 'queued' AND scheduled_at <= now()
        ORDER BY priority ASC, scheduled_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${limit}
      )
      RETURNING *
    `) as Row[];
  }

  async finishJob(id: string, status: "succeeded" | "failed", result?: Row, error?: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE integration_jobs SET status = ${status}, result = ${result ? JSON.stringify(result) : null}::jsonb, error = ${error ?? null}, finished_at = now(), locked_by = null
      WHERE id = ${id}::uuid AND org_id = ${this.orgId}::uuid
    `;
  }

  async requeueOrDeadLetter(job: Row): Promise<"requeued" | "dead"> {
    const attempts = Number(job.attempts ?? 0);
    const max = Number(job.max_attempts ?? 3);
    if (attempts >= max) {
      await this.prisma.$executeRaw`UPDATE integration_jobs SET status = 'dead', finished_at = now(), locked_by = null WHERE id = ${job.id as string}::uuid`;
      await this.prisma.$executeRaw`
        INSERT INTO integration_retry_queue (org_id, connection_id, job_id, entity, attempts, last_error, is_dead, payload)
        VALUES (${this.orgId}::uuid, ${job.connection_id as string}::uuid, ${job.id as string}::uuid, ${(job.entity as string) ?? null}, ${attempts}, ${(job.error as string) ?? null}, true, ${JSON.stringify(job.payload ?? {})}::jsonb)
      `;
      return "dead";
    }
    const backoffSec = Math.min(3600, 30 * 2 ** attempts);
    await this.prisma.$executeRaw`
      UPDATE integration_jobs SET status = 'queued', locked_by = null, scheduled_at = now() + (${backoffSec} || ' seconds')::interval WHERE id = ${job.id as string}::uuid
    `;
    return "requeued";
  }

  async setJobsStatusForConnection(connectionId: string, from: JobStatus, to: JobStatus): Promise<number> {
    const res = (await this.prisma.$executeRaw`
      UPDATE integration_jobs SET status = ${to} WHERE org_id = ${this.orgId}::uuid AND connection_id = ${connectionId}::uuid AND status = ${from}
    `) as unknown as number;
    return Number(res);
  }

  async log(jobId: string, level: "debug" | "info" | "warn" | "error", message: string, context?: Row): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO integration_job_logs (job_id, org_id, level, message, context)
      VALUES (${jobId}::uuid, ${this.orgId}::uuid, ${level}, ${message}, ${context ? JSON.stringify(context) : null}::jsonb)
    `;
  }

  async listLogs(connectionId: string, limit = 200): Promise<Row[]> {
    return (await this.prisma.$queryRaw`
      SELECT l.* FROM integration_job_logs l
      JOIN integration_jobs j ON j.id = l.job_id
      WHERE l.org_id = ${this.orgId}::uuid AND j.connection_id = ${connectionId}::uuid
      ORDER BY l.created_at DESC LIMIT ${limit}
    `) as Row[];
  }

  // --- Sync history ---------------------------------------------------------
  async recordSync(input: { connectionId: string; jobId?: string | null; entity: EntityType; direction: SyncDirection; created?: number; updated?: number; deleted?: number; conflicts?: number; errors?: number; status?: string }): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO integration_sync_history (org_id, connection_id, job_id, entity, direction, created_count, updated_count, deleted_count, conflict_count, error_count, status, finished_at)
      VALUES (${this.orgId}::uuid, ${input.connectionId}::uuid, ${input.jobId ?? null}::uuid, ${input.entity}, ${input.direction},
              ${input.created ?? 0}, ${input.updated ?? 0}, ${input.deleted ?? 0}, ${input.conflicts ?? 0}, ${input.errors ?? 0}, ${input.status ?? "success"}, now())
    `;
  }

  // --- Entity mapping (incremental sync state) ------------------------------
  async getEntityMappingByExternal(connectionId: string, entity: EntityType, externalId: string): Promise<Row | null> {
    const rows = (await this.prisma.$queryRaw`
      SELECT * FROM integration_entity_mapping WHERE connection_id = ${connectionId}::uuid AND entity = ${entity} AND external_id = ${externalId} LIMIT 1
    `) as Row[];
    return rows[0] ?? null;
  }

  async upsertEntityMapping(input: { connectionId: string; entity: EntityType; internalId?: string | null; externalId?: string | null; hash: string; checksum: string; externalModifiedAt?: string | null; status?: string; migrationSessionId?: string | null }): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO integration_entity_mapping (org_id, connection_id, entity, internal_id, external_id, hash, checksum, external_modified_at, last_synced_at, status, migration_session_id)
      VALUES (${this.orgId}::uuid, ${input.connectionId}::uuid, ${input.entity}, ${input.internalId ?? null}, ${input.externalId ?? null},
              ${input.hash}, ${input.checksum}, ${input.externalModifiedAt ?? null}::timestamptz, now(), ${input.status ?? "synced"}, ${input.migrationSessionId ?? null}::uuid)
      ON CONFLICT (connection_id, entity, external_id) WHERE external_id IS NOT NULL
      DO UPDATE SET internal_id = COALESCE(EXCLUDED.internal_id, integration_entity_mapping.internal_id),
                    hash = EXCLUDED.hash, checksum = EXCLUDED.checksum, version = integration_entity_mapping.version + 1,
                    external_modified_at = EXCLUDED.external_modified_at, last_synced_at = now(), status = EXCLUDED.status
    `;
  }

  async countMappingsForSession(sessionId: string): Promise<number> {
    const rows = (await this.prisma.$queryRaw`SELECT COUNT(*)::int AS c FROM integration_entity_mapping WHERE migration_session_id = ${sessionId}::uuid`) as Array<{ c: number }>;
    return rows[0]?.c ?? 0;
  }

  async deleteMappingsForSession(sessionId: string): Promise<number> {
    const res = (await this.prisma.$executeRaw`DELETE FROM integration_entity_mapping WHERE migration_session_id = ${sessionId}::uuid AND org_id = ${this.orgId}::uuid`) as unknown as number;
    return Number(res);
  }

  // --- Field mapping --------------------------------------------------------
  async getFieldMappings(connectionId: string, entity?: EntityType): Promise<Row[]> {
    if (entity) {
      return (await this.prisma.$queryRaw`SELECT * FROM integration_field_mapping WHERE connection_id = ${connectionId}::uuid AND entity = ${entity} ORDER BY sort_order, source_field`) as Row[];
    }
    return (await this.prisma.$queryRaw`SELECT * FROM integration_field_mapping WHERE connection_id = ${connectionId}::uuid ORDER BY entity, sort_order, source_field`) as Row[];
  }

  async saveFieldMappings(connectionId: string, entity: EntityType, mappings: FieldMapping[]): Promise<void> {
    await this.prisma.$executeRaw`DELETE FROM integration_field_mapping WHERE connection_id = ${connectionId}::uuid AND entity = ${entity}`;
    let order = 0;
    for (const m of mappings) {
      await this.prisma.$executeRaw`
        INSERT INTO integration_field_mapping (org_id, connection_id, entity, source_field, target_field, direction, transform, is_custom, is_calculated, enabled, sort_order)
        VALUES (${this.orgId}::uuid, ${connectionId}::uuid, ${entity}, ${m.sourceField}, ${m.targetField}, ${m.direction ?? "bidirectional"},
                ${m.transform ? JSON.stringify(m.transform) : null}::jsonb, ${m.isCustom ?? false}, ${m.isCalculated ?? false}, ${m.enabled ?? true}, ${order++})
      `;
    }
  }

  // --- Conflicts ------------------------------------------------------------
  async createConflict(input: { connectionId: string; entity: EntityType; internalId?: string | null; externalId?: string | null; strategy?: string; internalData?: Row; externalData?: Row; fieldDiffs?: unknown }): Promise<Row> {
    const rows = (await this.prisma.$queryRaw`
      INSERT INTO integration_conflicts (org_id, connection_id, entity, internal_id, external_id, strategy, internal_data, external_data, field_diffs)
      VALUES (${this.orgId}::uuid, ${input.connectionId}::uuid, ${input.entity}, ${input.internalId ?? null}, ${input.externalId ?? null},
              ${input.strategy ?? "manual"}, ${JSON.stringify(input.internalData ?? {})}::jsonb, ${JSON.stringify(input.externalData ?? {})}::jsonb, ${JSON.stringify(input.fieldDiffs ?? [])}::jsonb)
      RETURNING *
    `) as Row[];
    return rows[0];
  }

  async listConflicts(connectionId?: string, status = "open"): Promise<Row[]> {
    if (connectionId) {
      return (await this.prisma.$queryRaw`SELECT * FROM integration_conflicts WHERE org_id = ${this.orgId}::uuid AND connection_id = ${connectionId}::uuid AND status = ${status} ORDER BY created_at DESC`) as Row[];
    }
    return (await this.prisma.$queryRaw`SELECT * FROM integration_conflicts WHERE org_id = ${this.orgId}::uuid AND status = ${status} ORDER BY created_at DESC`) as Row[];
  }

  async resolveConflict(id: string, resolution: Row): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE integration_conflicts SET status = 'resolved', resolution = ${JSON.stringify(resolution)}::jsonb, resolved_by = ${this.userId ?? null}::uuid, resolved_at = now()
      WHERE id = ${id}::uuid AND org_id = ${this.orgId}::uuid
    `;
  }

  // --- Health metrics -------------------------------------------------------
  async recordHealthMetric(connectionId: string, metric: string, value: number): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO integration_health_metrics (org_id, connection_id, metric, value) VALUES (${this.orgId}::uuid, ${connectionId}::uuid, ${metric}, ${value})
    `;
  }

  async getHealthSeries(connectionId: string, metric: string, days = 30): Promise<Array<{ captured_at: string; value: number }>> {
    return (await this.prisma.$queryRaw`
      SELECT captured_at, value FROM integration_health_metrics
      WHERE connection_id = ${connectionId}::uuid AND metric = ${metric} AND captured_at >= now() - (${days} || ' days')::interval
      ORDER BY captured_at ASC
    `) as Array<{ captured_at: string; value: number }>;
  }

  // --- Migration sessions ---------------------------------------------------
  async createMigrationSession(input: { connectionId: string; mode: string; entities: EntityType[]; options?: Row }): Promise<Row> {
    const rows = (await this.prisma.$queryRaw`
      INSERT INTO migration_sessions (org_id, connection_id, mode, entities, options, created_by, status)
      VALUES (${this.orgId}::uuid, ${input.connectionId}::uuid, ${input.mode}, ${JSON.stringify(input.entities)}::jsonb, ${JSON.stringify(input.options ?? {})}::jsonb, ${this.userId ?? null}::uuid, 'created')
      RETURNING *
    `) as Row[];
    return rows[0];
  }

  async getMigrationSession(id: string): Promise<Row | null> {
    const rows = (await this.prisma.$queryRaw`SELECT * FROM migration_sessions WHERE id = ${id}::uuid AND org_id = ${this.orgId}::uuid LIMIT 1`) as Row[];
    return rows[0] ?? null;
  }

  async updateMigrationSession(id: string, patch: Partial<{ status: string; analysis: Row; progress: Row; totals: Row; resume_cursor: Row; started_at: string; finished_at: string }>): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE migration_sessions SET
        status = COALESCE(${patch.status ?? null}, status),
        analysis = COALESCE(${patch.analysis ? JSON.stringify(patch.analysis) : null}::jsonb, analysis),
        progress = COALESCE(${patch.progress ? JSON.stringify(patch.progress) : null}::jsonb, progress),
        totals = COALESCE(${patch.totals ? JSON.stringify(patch.totals) : null}::jsonb, totals),
        resume_cursor = COALESCE(${patch.resume_cursor ? JSON.stringify(patch.resume_cursor) : null}::jsonb, resume_cursor),
        started_at = COALESCE(${patch.started_at ?? null}::timestamptz, started_at),
        finished_at = COALESCE(${patch.finished_at ?? null}::timestamptz, finished_at),
        updated_at = now()
      WHERE id = ${id}::uuid AND org_id = ${this.orgId}::uuid
    `;
  }

  async saveMigrationReport(sessionId: string, report: Row): Promise<Row> {
    const rows = (await this.prisma.$queryRaw`
      INSERT INTO migration_reports (org_id, session_id, report) VALUES (${this.orgId}::uuid, ${sessionId}::uuid, ${JSON.stringify(report)}::jsonb) RETURNING *
    `) as Row[];
    return rows[0];
  }

  async getMigrationReport(sessionId: string): Promise<Row | null> {
    const rows = (await this.prisma.$queryRaw`SELECT * FROM migration_reports WHERE session_id = ${sessionId}::uuid AND org_id = ${this.orgId}::uuid ORDER BY created_at DESC LIMIT 1`) as Row[];
    return rows[0] ?? null;
  }

  // --- Notifications --------------------------------------------------------
  async notify(input: { connectionId?: string | null; type: string; severity?: string; title: string; body: string; email?: boolean }): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO integration_notifications (org_id, connection_id, user_id, type, severity, title, body)
      VALUES (${this.orgId}::uuid, ${input.connectionId ?? null}::uuid, ${this.userId ?? null}::uuid, ${input.type}, ${input.severity ?? "info"}, ${input.title}, ${input.body})
    `;
    // Mirror to the global in-app notification centre (best effort).
    try {
      await this.prisma.$executeRaw`
        INSERT INTO notifications (org_id, user_id, title, body, entity_type, entity_id)
        VALUES (${this.orgId}::uuid, ${this.userId ?? null}::uuid, ${input.title}, ${input.body}, 'integration', ${input.connectionId ?? null}::uuid)
      `;
    } catch {
      // global table optional
    }
    // Email delivery (best effort) for important events when a provider is set.
    if (input.email !== false && isEmailConfigured()) {
      try {
        const to = await this.resolveRecipientEmail();
        if (to) await sendEmail({ to, subject: input.title, html: emailHtml(`<p>${input.body}</p>`) });
      } catch {
        // email is best-effort; never block the platform on it
      }
    }
  }

  /** Resolve an email for integration alerts: the actor, else an org owner/admin. */
  private async resolveRecipientEmail(): Promise<string | null> {
    try {
      if (this.userId) {
        const r = (await this.prisma.$queryRaw`SELECT email FROM auth.users WHERE id = ${this.userId}::uuid LIMIT 1`) as Array<{ email: string | null }>;
        if (r[0]?.email) return r[0].email;
      }
      const owner = (await this.prisma.$queryRaw`
        SELECT u.email FROM profiles p JOIN auth.users u ON u.id = p.id
        WHERE p.org_id = ${this.orgId}::uuid AND p.role IN ('owner','admin','super_admin') AND u.email IS NOT NULL
        ORDER BY p.role LIMIT 1
      `) as Array<{ email: string | null }>;
      return owner[0]?.email ?? null;
    } catch {
      return null;
    }
  }

  async listNotifications(limit = 50): Promise<Row[]> {
    return (await this.prisma.$queryRaw`SELECT * FROM integration_notifications WHERE org_id = ${this.orgId}::uuid ORDER BY created_at DESC LIMIT ${limit}`) as Row[];
  }

  // --- Dashboard aggregates -------------------------------------------------
  async dashboard(): Promise<Row> {
    const [conns, jobs, conflicts, history] = await Promise.all([
      this.prisma.$queryRaw`SELECT status, COUNT(*)::int AS c FROM integration_connections WHERE org_id = ${this.orgId}::uuid GROUP BY status` as Promise<Row[]>,
      this.prisma.$queryRaw`SELECT status, COUNT(*)::int AS c FROM integration_jobs WHERE org_id = ${this.orgId}::uuid GROUP BY status` as Promise<Row[]>,
      this.prisma.$queryRaw`SELECT COUNT(*)::int AS c FROM integration_conflicts WHERE org_id = ${this.orgId}::uuid AND status = 'open'` as Promise<Array<{ c: number }>>,
      this.prisma.$queryRaw`
        SELECT COALESCE(SUM(created_count),0)::int AS created, COALESCE(SUM(updated_count),0)::int AS updated,
               COALESCE(SUM(deleted_count),0)::int AS deleted, COALESCE(SUM(error_count),0)::int AS errors
        FROM integration_sync_history WHERE org_id = ${this.orgId}::uuid AND started_at >= now() - interval '30 days'` as Promise<Row[]>
    ]);
    return { connections: conns, jobs, openConflicts: conflicts[0]?.c ?? 0, last30: history[0] ?? {} };
  }
}
