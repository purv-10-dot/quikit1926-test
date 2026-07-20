/**
 * LiveKit SFU provider — production WebRTC SFU using official livekit-server-sdk.
 * Requires LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL env vars.
 */
import { AccessToken, RoomServiceClient, TrackSource } from "livekit-server-sdk";
import type { SFUParticipant, SFUProvider, SFURoom } from "./sfu-provider";

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

/* eslint-disable @typescript-eslint/no-explicit-any */
function mapParticipant(p: any): SFUParticipant {
  const tracks = p.tracks ?? [];
  const hasAudio = tracks.some((t: any) => t.source === "MICROPHONE" && !t.muted);
  const hasVideo = tracks.some((t: any) => t.source === "CAMERA" && !t.muted);
  const hasScreenShare = tracks.some(
    (t: any) => (t.source === "SCREEN_SHARE" || t.source === "SCREEN_SHARE_AUDIO") && !t.muted,
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
    const roomService = getRoomServiceClient();
    if (!roomService) {
      throw new Error(
        "LiveKit not configured: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL required",
      );
    }

    try {
      await roomService.createRoom({
        name: roomId,
        emptyTimeout: 300,
        maxParticipants: 50,
      });
    } catch (e) {
      console.warn(`LiveKit createRoom note: ${e}`);
    }

    return {
      roomId,
      name: roomId,
      createdAt: new Date(),
    };
  }

  async generateToken(roomId: string, userId: string, name: string): Promise<string> {
    const config = getLiveKitConfig();
    if (!config) {
      throw new Error(
        "LiveKit not configured: LIVEKIT_API_KEY, LIVEKIT_API_SECRET, LIVEKIT_URL required",
      );
    }

    const at = new AccessToken(config.apiKey, config.apiSecret, {
      identity: userId,
      name,
      ttl: 86400,
    });

    at.addGrant({
      room: roomId,
      roomJoin: true,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true,
    });

    return at.toJwt();
  }

  async listParticipants(roomId: string): Promise<SFUParticipant[]> {
    const roomService = getRoomServiceClient();
    if (!roomService) return [];

    try {
      const participants = await roomService.listParticipants(roomId);
      return participants.map(mapParticipant);
    } catch {
      return [];
    }
  }

  async getParticipant(roomId: string, identity: string): Promise<SFUParticipant | null> {
    const roomService = getRoomServiceClient();
    if (!roomService) return null;

    try {
      const participant = await roomService.getParticipant(roomId, identity);
      return mapParticipant(participant);
    } catch {
      return null;
    }
  }

  async removeParticipant(roomId: string, identity: string): Promise<void> {
    const roomService = getRoomServiceClient();
    if (!roomService) return;

    await roomService.removeParticipant(roomId, identity);
  }

  async muteTrack(
    roomId: string,
    identity: string,
    trackSid: string,
    muted: boolean,
  ): Promise<void> {
    const roomService = getRoomServiceClient();
    if (!roomService) return;

    await roomService.mutePublishedTrack(roomId, identity, trackSid, muted);
  }

  async deleteRoom(roomId: string): Promise<void> {
    const roomService = getRoomServiceClient();
    if (!roomService) return;

    try {
      await roomService.deleteRoom(roomId);
    } catch {
      // Room may not exist — ignore
    }
  }

  async muteParticipant(roomId: string, identity: string, muted: boolean): Promise<void> {
    const roomService = getRoomServiceClient();
    if (!roomService) return;

    try {
      const participant = await roomService.getParticipant(roomId, identity);
      for (const track of participant.tracks ?? []) {
        if (track.source === TrackSource.CAMERA) {
          await roomService.mutePublishedTrack(roomId, identity, track.sid, muted);
        }
      }
    } catch {
      // Participant may not exist — ignore
    }
  }

  async muteAllParticipants(roomId: string, excludeIdentity?: string): Promise<void> {
    const roomService = getRoomServiceClient();
    if (!roomService) return;

    try {
      const participants = await roomService.listParticipants(roomId);
      for (const p of participants) {
        if (excludeIdentity && p.identity === excludeIdentity) continue;
        for (const track of p.tracks ?? []) {
          if (track.source === TrackSource.CAMERA && !track.muted) {
            await roomService.mutePublishedTrack(roomId, p.identity, track.sid, true);
          }
        }
      }
    } catch {
      // Room may not exist — ignore
    }
  }
}
