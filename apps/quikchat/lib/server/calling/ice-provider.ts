/**
 * IceConfigProvider seam (CALL-2). `ICE_MODE` picks the active provider for
 * the deployment. Stub (default) returns Google STUN servers (free, local dev);
 * real returns coturn TURN credentials (needed for NAT traversal in production).
 *
 * Misconfig (incomplete env) → stub fallback + a boot warning; never crash.
 * The active mode is logged once.
 *
 *   stub  (default) — Google STUN servers, hermetic
 *   real            — coturn TURN credentials from env
 */

export interface IceConfigProvider {
  getIceConfig(): Promise<{ iceServers: RTCIceServer[] }>;
}

export type IceMode = "stub" | "real";

/** Pure mode selection from an env-like object (for tests). */
export function selectIceMode(env: Record<string, string | undefined> = process.env): {
  mode: IceMode;
  warning?: string;
} {
  if (env.ICE_MODE === "real") {
    if (env.TURN_URLS) return { mode: "real" };
    return { mode: "stub", warning: "ICE_MODE=real but TURN_URLS is unset" };
  }
  return { mode: "stub" };
}
