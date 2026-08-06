/**
 * LiveKit SFU provider — production WebRTC SFU using official livekit-server-sdk.
 * Requires LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL env vars.
 */
import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import { logger } from "@/lib/shared";
import type { SFUParticipant, SFUProvider, SFURoom } from "./sfu-provider";

const NOT_CONFIGURED_MESSAGE =
  "LiveKit not configured: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL required";

function getLiveKitConfig(): { apiKey: string; apiSecret: string; url: string } | null {
  const apiKey = process.env.LIVEKIT_API_KEY;
  const apiSecret = process.env.LIVEKIT_API_SECRET;
  const url = process.env.LIVEKIT_URL;
  if (!apiKey || !apiSecret || !url) return null;
  return { apiKey, apiSecret, url };
}

function getRoomServiceClient(): RoomServiceClient | null {
  const config = getLiveKitConfig();
  if (!config) return null;
  return new RoomServiceClient(config.url, config.apiKey, config.apiSecret);
}

/**
 * `LiveSFUProvider` is only ever constructed by `getSFUProvider()` after
 * `selectSFUMode()` has confirmed all three LIVEKIT_* env vars are present —
 * the graceful "not configured" case is already handled one layer up via the
 * stub fallback. So a null client HERE means config vanished out from under an
 * already-live process: an operational anomaly, not a normal path. Silently
 * no-op'ing on that is how `muteAllParticipants` on a misconfigured deploy
 * becomes a host clicking Mute All and being told (implicitly, by the absence
 * of an error) that it worked. Throw instead, after logging — every caller
 * either already has no try/catch around these methods (so this matches the
 * behavior an operational LiveKit failure already produces today) or already
 * wraps the call in its own best-effort catch.
 */
function requireRoomServiceClient(roomId: string): RoomServiceClient {
  const client = getRoomServiceClient();
  if (!client) {
    logger.error(
      { roomId },
      "LiveKit room service unavailable — selectSFUMode() picked live mode but credentials are now missing",
    );
    throw new Error(NOT_CONFIGURED_MESSAGE);
  }
  return client;
}

/**
 * Pull safe, explicit fields off an unknown thrown value for logging — NEVER
 * the error object itself. `RoomServiceClient` speaks Twirp-over-HTTP; its
 * `ServerError` carries `status`/`code`/`metadata`, and `metadata` is sourced
 * from the SERVER's response body (see livekit-server-sdk's `toTwirpError`) —
 * not from the outgoing request, so today's SDK shouldn't be able to echo the
 * Authorization bearer JWT (built from LIVEKIT_API_SECRET) back onto it. But
 * that's an SDK-internals fact that could stop holding after a version bump,
 * so the logging code doesn't rely on it: only these four named fields are
 * ever read off the error, so there is nothing for a future `metadata` (or a
 * `config`/`request` field some other error shape might carry) to leak
 * through. See the "does not leak a planted secret" test for the empirical
 * check this comment doesn't get to skip.
 */
function errorFields(err: unknown): {
  errName: string;
  errMessage: string;
  errCode: string | number | undefined;
  errStatus: number | undefined;
} {
  const e = err as { code?: unknown; status?: unknown } | null | undefined;
  return {
    errName: err instanceof Error ? err.name : typeof err,
    errMessage: err instanceof Error ? err.message : "unknown error",
    errCode: typeof e?.code === "string" || typeof e?.code === "number" ? e.code : undefined,
    errStatus: typeof e?.status === "number" ? e.status : undefined,
  };
}

// Token TTL matches the call model's hard duration cap (ACTIVE_MAX_DURATION_MS
// in timeout-sweep.ts) rather than a short-lived default — a token that expires
// mid-call would fail a legitimate reconnect. It's still a large improvement
// over an unbounded/24h token: it can't be used to rejoin a room hours after
// the call it was minted for has ended.
const TOKEN_TTL_SECONDS = 4 * 60 * 60;

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapParticipant(p: any): SFUParticipant {
  const tracks = p.tracks ?? [];
  // TrackSource is a numeric protobuf enum (CAMERA=1, MICROPHONE=2, ...) —
  // comparing against the enum member, not its string name, which `t.source`
  // never equals. The string comparison here always evaluated to false, so
  // isMuted/hasVideo from listParticipants() never reflected reality.
  const hasAudio = tracks.some((t: any) => t.source === TrackSource.MICROPHONE && !t.muted);
  const hasVideo = tracks.some((t: any) => t.source === TrackSource.CAMERA && !t.muted);
  const hasScreenShare = tracks.some(
    (t: any) =>
      (t.source === TrackSource.SCREEN_SHARE || t.source === TrackSource.SCREEN_SHARE_AUDIO) &&
      !t.muted,
  );

  return {
    id: p.sid ?? "",
    identity: p.identity ?? "",
    name: p.name || p.identity || "",
    isSpeaking: false,
    isMuted: !hasAudio,
    hasVideo,
    hasScreenShare,
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export class LiveSFUProvider implements SFUProvider {
  async createRoom(roomId: string): Promise<SFURoom> {
    const roomService = requireRoomServiceClient(roomId);

    try {
      await roomService.createRoom({
        name: roomId,
        // Short safety-net window: deleteRoom() is called explicitly when a call
        // ends (PATCH /api/calls/:id), so this only covers the case where that
        // never fires (crash, dropped request) — keep it short to bound wasted
        // billed room-minutes on an abandoned room.
        emptyTimeout: 60,
        maxParticipants: 50,
      });
    } catch (e) {
      logger.error({ ...errorFields(e), roomId }, "LiveKit createRoom failed");
    }

    return {
      roomId,
      name: roomId,
      createdAt: new Date(),
    };
  }

  async generateToken(
    roomId: string,
    userId: string,
    name: string,
    opts?: { isHost?: boolean },
  ): Promise<string> {
    const config = getLiveKitConfig();
    if (!config) {
      logger.error({ roomId }, "LiveKit not configured — cannot mint access token");
      throw new Error(NOT_CONFIGURED_MESSAGE);
    }

    const at = new AccessToken(config.apiKey, config.apiSecret, {
      identity: userId,
      name,
      ttl: TOKEN_TTL_SECONDS,
    });

    at.addGrant({
      room: roomId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
      // Host (call initiator) can mute/remove other participants server-side.
      roomAdmin: opts?.isHost === true,
    });

    return at.toJwt();
  }

  async listParticipants(roomId: string): Promise<SFUParticipant[]> {
    const roomService = requireRoomServiceClient(roomId);

    try {
      const participants = await roomService.listParticipants(roomId);
      return participants.map(mapParticipant);
    } catch (e) {
      logger.error({ ...errorFields(e), roomId }, "LiveKit listParticipants failed");
      return [];
    }
  }

  async getParticipant(roomId: string, identity: string): Promise<SFUParticipant | null> {
    const roomService = requireRoomServiceClient(roomId);

    try {
      const participant = await roomService.getParticipant(roomId, identity);
      return mapParticipant(participant);
    } catch (e) {
      logger.error({ ...errorFields(e), roomId, identity }, "LiveKit getParticipant failed");
      return null;
    }
  }

  async removeParticipant(roomId: string, identity: string): Promise<void> {
    const roomService = requireRoomServiceClient(roomId);

    try {
      await roomService.removeParticipant(roomId, identity);
    } catch (e) {
      // Observability only: this still rejects, same as before the fix — the
      // caller (PATCH /api/calls/:id/participants/:identity has no try/catch
      // of its own) gets the same failure signal it always did, now diagnosable.
      logger.error({ ...errorFields(e), roomId, identity }, "LiveKit removeParticipant failed");
      throw e;
    }
  }

  async muteTrack(
    roomId: string,
    identity: string,
    trackSid: string,
    muted: boolean,
  ): Promise<void> {
    const roomService = requireRoomServiceClient(roomId);

    try {
      await roomService.mutePublishedTrack(roomId, identity, trackSid, muted);
    } catch (e) {
      // Same observability-only rethrow as removeParticipant above.
      logger.error(
        { ...errorFields(e), roomId, identity, trackSid },
        "LiveKit muteTrack failed",
      );
      throw e;
    }
  }

  async deleteRoom(roomId: string): Promise<void> {
    const roomService = requireRoomServiceClient(roomId);

    try {
      await roomService.deleteRoom(roomId);
    } catch (e) {
      // Room may not exist — still swallowed (unchanged contract), now logged.
      logger.error({ ...errorFields(e), roomId }, "LiveKit deleteRoom failed");
    }
  }

  async muteParticipant(roomId: string, identity: string, muted: boolean): Promise<void> {
    const roomService = requireRoomServiceClient(roomId);

    try {
      const participant = await roomService.getParticipant(roomId, identity);
      for (const track of participant.tracks ?? []) {
        // Mute targets the microphone — muting someone should silence their
        // audio, not turn off their camera.
        if (track.source === TrackSource.MICROPHONE) {
          await roomService.mutePublishedTrack(roomId, identity, track.sid, muted);
        }
      }
    } catch (e) {
      // Participant may not exist — still swallowed (unchanged contract), now logged.
      logger.error({ ...errorFields(e), roomId, identity }, "LiveKit muteParticipant failed");
    }
  }

  async muteAllParticipants(roomId: string, excludeIdentity?: string): Promise<void> {
    const roomService = requireRoomServiceClient(roomId);

    try {
      const participants = await roomService.listParticipants(roomId);
      for (const p of participants) {
        if (excludeIdentity && p.identity === excludeIdentity) continue;
        for (const track of p.tracks ?? []) {
          if (track.source === TrackSource.MICROPHONE && !track.muted) {
            await roomService.mutePublishedTrack(roomId, p.identity, track.sid, true);
          }
        }
      }
    } catch (e) {
      // Room may not exist — still swallowed (unchanged contract), now logged.
      logger.error({ ...errorFields(e), roomId }, "LiveKit muteAllParticipants failed");
    }
  }
}
