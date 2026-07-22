/**
 * QuikChat → runtime auth (the reverse of S07). QuikChat mints a short-lived
 * agent JWT the runtime verifies. This is a SEPARATE credential from the S07
 * runtime→QuikChat token (opposite iss/aud).
 *
 * `mintRuntimeToken` is a seam: today it signs locally with `AGENT_JWT_SECRET`
 * (HS256 stub) so it's testable without the platform; the real path will call
 * the platform `issue-agent-jwt` (internal-secret) and drop in here unchanged.
 */
import jwt from "jsonwebtoken";

export const RUNTIME_TOKEN_ISSUER = "quikchat";
export const RUNTIME_TOKEN_AUDIENCE = "quikverse-runtime";
const TTL_SECONDS = 5 * 60;

export interface RuntimeTokenInput {
  orgId: string;
  /** The QuikChat-owned bot identity (becomes `sub`). */
  botAgentId: string;
  /** The human who invoked the assistant (for runtime telemetry). */
  userId: string;
  /** Optional run correlation id, when known up front. */
  agentRunId?: string;
}

export interface RuntimeTokenClaims {
  iss: string;
  aud: string;
  sub: string;
  orgId: string;
  userId: string;
  actorType: "ai_agent";
  agentRunId?: string;
}

function secret(): string {
  return process.env.AGENT_JWT_SECRET || "dev-only-agent-secret-change-me";
}

/** Mint a short-lived agent JWT to present to the runtime. */
export async function mintRuntimeToken(input: RuntimeTokenInput): Promise<string> {
  const claims: RuntimeTokenClaims = {
    iss: RUNTIME_TOKEN_ISSUER,
    aud: RUNTIME_TOKEN_AUDIENCE,
    sub: input.botAgentId,
    orgId: input.orgId,
    userId: input.userId,
    actorType: "ai_agent",
    ...(input.agentRunId ? { agentRunId: input.agentRunId } : {}),
  };
  return jwt.sign(claims, secret(), { expiresIn: TTL_SECONDS });
}
