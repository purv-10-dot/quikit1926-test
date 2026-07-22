/**
 * The resolved per-request identity for the human product path. Every org-scoped
 * operation takes this so `orgId` is threaded explicitly rather than read
 * ambiently. Matches the platform's context shape.
 */
export interface OrgContext {
  userId: string;
  orgId: string;
}

/**
 * Unified actor resolved by the internal auth gate — a human (NextAuth session)
 * OR an AI agent (runtime agent JWT). The human product gate keeps using the
 * narrower `OrgContext`; `/api/internal/*` resolves this.
 */
export interface OrgActor {
  orgId: string;
  actorType: "human" | "ai_agent";
  /** Present for human actors. */
  userId?: string;
  /** Present for agent actors. */
  agentId?: string;
  agentRunId?: string;
  /** Per-run channel allow-list carried by a scoped agent token. */
  channelScope?: string[];
}

/** A module surfaced by an app in the platform's left-nav / app registry. */
export interface ModuleDefinition {
  id: string;
  label: string;
}

/** An app's entry in the platform module registry. */
export interface AppRegistryEntry {
  id: string;
  label: string;
  /** Icon key resolved by the platform shell; placeholder for now. */
  icon: string;
  modules: ModuleDefinition[];
}
