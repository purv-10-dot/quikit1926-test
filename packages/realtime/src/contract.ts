/**
 * @quikit/realtime — shared contract.
 *
 * This file is CLIENT-SAFE: it contains only constants and types, no Node-only
 * imports (no ioredis, no jsonwebtoken). The browser bundle imports from here
 * via `@quikit/realtime`. Server-only code (publishing, token signing) lives in
 * `./server` and must NOT be imported from client components.
 *
 * Design: we broadcast a tiny SIGNAL (what changed + where), never the record
 * data itself. Clients react by invalidating the matching React Query keys and
 * refetching through the existing, already-authorized API routes. This keeps
 * tenant isolation in the API layer and avoids duplicating business logic.
 */

/** Redis Pub/Sub channel: API routes publish here, the socket server subscribes. */
export const REALTIME_CHANNEL = "quikscale:realtime";

/** The single Socket.io event name clients listen for. */
export const REALTIME_EVENT = "entity:changed";

export type RealtimeEntity = "kpi" | "priority" | "www";

export type RealtimeAction = "created" | "updated" | "deleted" | "restored";

export interface RealtimeSignal {
  /** Which module changed. */
  entity: RealtimeEntity;
  /** What happened. */
  action: RealtimeAction;
  /** Affected record id (or a representative id for batch updates). */
  id: string;
  /**
   * Tenant the change belongs to. Set SERVER-SIDE from the authenticated write
   * (never from client input). Used as the broadcast room key so a change can
   * only ever reach the org it belongs to.
   */
  orgId: string;
  /** Team the record belongs to, if any (team-level KPI / Priority). */
  teamId?: string | null;
  /** Owner of the record, if relevant (reserved for finer-grained scoping). */
  ownerId?: string | null;
  /** Quarter scope, so dashboard/quarter-filtered views know if they care. */
  year?: number;
  quarter?: string;
  /** Who triggered the change — used by the client to suppress its own echo. */
  actorUserId: string;
  /** Publish timestamp (ms). Debug / ordering only. */
  ts: number;
}

/** Room a tenant's clients all join. Every broadcast targets exactly one of these. */
export const orgRoom = (orgId: string): string => `org:${orgId}`;

/** Optional finer room for team-scoped fan-out. */
export const teamRoom = (orgId: string, teamId: string): string =>
  `team:${orgId}:${teamId}`;
