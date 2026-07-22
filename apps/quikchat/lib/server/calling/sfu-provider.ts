/* eslint-env node */
/**
 * SFU (Selective Forwarding Unit) provider seam for group calls.
 * Stub (default) returns mock data for local dev;
 * LiveKit integration handles real SFU in production.
 *
 *   stub  (default) — mock room/participants
 *   live            — LiveKit SFU
 */

export interface SFURoom {
  roomId: string;
  name: string;
  createdAt: Date;
}

export interface SFUParticipant {
  id: string;
  identity: string;
  name: string;
  isSpeaking: boolean;
  isMuted: boolean;
  hasVideo: boolean;
  hasScreenShare: boolean;
}

export interface SFUProvider {
  createRoom(roomId: string): Promise<SFURoom>;
  generateToken(roomId: string, userId: string, name: string): Promise<string>;
  listParticipants(roomId: string): Promise<SFUParticipant[]>;
  removeParticipant(roomId: string, identity: string): Promise<void>;
  muteParticipant(roomId: string, identity: string, muted: boolean): Promise<void>;
  muteAllParticipants(roomId: string, excludeIdentity?: string): Promise<void>;
}

export type SFUMode = "stub" | "live";

/** Pure mode selection from an env-like object (for tests). */
export function selectSFUMode(env: Record<string, string | undefined> = process.env): {
  mode: SFUMode;
  warning?: string;
} {
  if (env.SFU_MODE === "live") {
    if (env.LIVEKIT_URL) return { mode: "live" };
    return { mode: "stub", warning: "SFU_MODE=live but LIVEKIT_URL is unset" };
  }
  return { mode: "stub" };
}

let cachedProvider: SFUProvider | null = null;

/** Return the configured SFU provider (cached per process). */
export function getSFUProvider(): SFUProvider {
  if (cachedProvider) return cachedProvider;
  const { mode } = selectSFUMode();
  if (mode === "live") {
    // Dynamic import so the LiveKit SDK is only loaded in live mode
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { LiveSFUProvider } = require("./sfu-provider.livekit") as {
      LiveSFUProvider: new () => SFUProvider;
    };
    cachedProvider = new LiveSFUProvider();
  } else {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { StubSFUProvider } = require("./sfu-provider.stub") as {
      StubSFUProvider: new () => SFUProvider;
    };
    cachedProvider = new StubSFUProvider();
  }
  return cachedProvider;
}

/** Test hook: drop the cached provider so a new env selection takes effect. */
export function __resetSFUForTest(): void {
  cachedProvider = null;
}
