import type {
  ConnectResult, EntityType, HealthCheckResult, ProviderDescriptor, ProviderMetadata,
  PullResult, PushResult, RecordChange, SyncDirection, SyncOptions
} from "./types";

/** Decrypted token set handed to a provider at runtime (never persisted raw). */
export type TokenSet = {
  accessToken?: string | null;
  refreshToken?: string | null;
  tokenType?: string | null;
  scope?: string | null;
  expiresAt?: string | null;
};

/**
 * Everything a provider needs to talk to its external system. Built by the
 * repository/API layer per request so providers stay stateless and testable.
 * Note providers never touch the database directly — persistence (entity maps,
 * history) is the engines' job. Providers only do external I/O + token refresh.
 */
export type ProviderContext = {
  connectionId: string;
  orgId: string;
  region?: string | null;
  externalOrgId?: string | null;
  /** Non-secret config: host, port, ssl, redirectUri, etc. */
  config: Record<string, unknown>;
  /** Decrypted credentials: client_id, client_secret, password, etc. */
  credentials: Record<string, string>;
  /** Decrypted OAuth tokens, when applicable. */
  tokens: TokenSet | null;
  /** Persist refreshed tokens back to storage (encrypted by the repo). */
  saveTokens: (tokens: TokenSet) => Promise<void>;
  /** Structured logging sink (writes to integration_job_logs when a job is active). */
  log: (level: "debug" | "info" | "warn" | "error", message: string, context?: Record<string, unknown>) => void | Promise<void>;
  /** Injectable fetch for testing; defaults to global fetch. */
  fetch?: typeof fetch;
};

/**
 * The Provider Strategy interface. Adding a new accounting system means writing
 * ONE class that implements this — no engine changes. This is the SDK contract.
 */
export interface AccountingProvider {
  readonly descriptor: ProviderDescriptor;

  /** Establish a connection. OAuth providers return an authorizationUrl. */
  connect(): Promise<ConnectResult>;
  /** Tear down (revoke tokens / close listeners) — best effort. */
  disconnect(): Promise<void>;
  /** Complete authentication (e.g. exchange an OAuth code). */
  authenticate(params: Record<string, string>): Promise<TokenSet>;
  /** Refresh an expired access token. */
  refreshToken(): Promise<TokenSet>;
  /** Cheap liveness/credential check. */
  validateConnection(): Promise<boolean>;
  /** Discover organizations/companies and capabilities. */
  getMetadata(): Promise<ProviderMetadata>;
  /** Incremental pull of changes for one entity since a cursor. */
  pullChanges(entity: EntityType, since?: string | null, cursor?: string | null): Promise<PullResult>;
  /** Push local changes for one entity to the external system. */
  pushChanges(entity: EntityType, changes: RecordChange[]): Promise<PushResult>;
  /** High-level convenience sync (engine remains the authoritative orchestrator). */
  sync(options?: SyncOptions): Promise<{ pulled: number; pushed: number }>;
  /** Detailed health probe used by the health engine. */
  healthCheck(): Promise<HealthCheckResult>;
}

/**
 * Shared base: token-refresh-on-expiry guard, a default convenience sync, and a
 * default healthCheck built on validateConnection. Concrete providers override
 * the I/O methods.
 */
export abstract class BaseProvider implements AccountingProvider {
  abstract readonly descriptor: ProviderDescriptor;
  protected ctx: ProviderContext;

  constructor(ctx: ProviderContext) {
    this.ctx = ctx;
  }

  protected get http(): typeof fetch {
    return this.ctx.fetch ?? fetch;
  }

  abstract connect(): Promise<ConnectResult>;
  abstract authenticate(params: Record<string, string>): Promise<TokenSet>;
  abstract refreshToken(): Promise<TokenSet>;
  abstract validateConnection(): Promise<boolean>;
  abstract getMetadata(): Promise<ProviderMetadata>;
  abstract pullChanges(entity: EntityType, since?: string | null, cursor?: string | null): Promise<PullResult>;
  abstract pushChanges(entity: EntityType, changes: RecordChange[]): Promise<PushResult>;

  async disconnect(): Promise<void> {
    // Default: nothing to revoke. OAuth providers override to revoke tokens.
  }

  /** Returns a valid access token, refreshing first when within 60s of expiry. */
  protected async ensureToken(): Promise<string | null> {
    const t = this.ctx.tokens;
    if (!t?.accessToken) return null;
    const exp = t.expiresAt ? Date.parse(t.expiresAt) : 0;
    if (exp && exp - Date.now() < 60_000 && t.refreshToken) {
      const refreshed = await this.refreshToken();
      await this.ctx.saveTokens(refreshed);
      this.ctx.tokens = refreshed;
      return refreshed.accessToken ?? null;
    }
    return t.accessToken;
  }

  async sync(options?: SyncOptions): Promise<{ pulled: number; pushed: number }> {
    const entities = options?.entities ?? this.descriptor.capabilities.entities;
    let pulled = 0;
    let pushed = 0;
    for (const entity of entities) {
      const dir = options?.direction ?? "bidirectional";
      if (dir === "pull" || dir === "bidirectional") {
        const res = await this.pullChanges(entity);
        pulled += res.records.length;
      }
    }
    return { pulled, pushed };
  }

  async healthCheck(): Promise<HealthCheckResult> {
    const start = Date.now();
    try {
      const ok = await this.validateConnection();
      return {
        ok,
        latencyMs: Date.now() - start,
        message: ok ? "Connection healthy." : "Connection check failed.",
        tokenExpiresAt: this.ctx.tokens?.expiresAt ?? null
      };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - start,
        message: error instanceof Error ? error.message : "Health check failed.",
        tokenExpiresAt: this.ctx.tokens?.expiresAt ?? null
      };
    }
  }
}
