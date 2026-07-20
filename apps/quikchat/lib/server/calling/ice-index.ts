/**
 * ICE config provider selection (CALL-2). `ICE_MODE` picks the active provider
 * for the deployment. Stub (default) returns Google STUN servers; real returns
 * coturn TURN credentials. Misconfig → stub fallback + boot warning; never crash.
 * The active mode is logged once.
 *
 *   stub  (default) — Google STUN, hermetic
 *   real            — coturn TURN (NAT traversal)
 */
import { logger } from "@/lib/shared";
import { RealIceConfigProvider } from "./ice-provider.real";
import { StubIceConfigProvider } from "./ice-provider.stub";
import { selectIceMode, type IceConfigProvider, type IceMode } from "./ice-provider";

export type { IceConfigProvider, IceMode } from "./ice-provider";
export { selectIceMode } from "./ice-provider";
export { StubIceConfigProvider } from "./ice-provider.stub";
export { RealIceConfigProvider, turnConfigFromEnv } from "./ice-provider.real";

let cached: { mode: IceMode; provider: IceConfigProvider } | null = null;

export function getIceConfigProvider(): IceConfigProvider {
  const { mode, warning } = selectIceMode();
  if (cached && cached.mode === mode) return cached.provider;
  if (warning) logger.warn({ warning }, "ICE config provider misconfigured — falling back to stub");

  const provider: IceConfigProvider =
    mode === "real" ? new RealIceConfigProvider() : new StubIceConfigProvider();

  logger.info({ mode }, "ice config provider active");
  cached = { mode, provider };
  return provider;
}

/** Test hook: drop the cached provider so a new env selection takes effect. */
export function __resetIceConfigForTest(): void {
  cached = null;
}
