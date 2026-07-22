/**
 * Stub SFU provider — returns mock room/participants for local dev.
 * Active default until LiveKit is deployed.
 */
import type { SFUParticipant, SFUProvider, SFURoom } from "./sfu-provider";

export class StubSFUProvider implements SFUProvider {
  async createRoom(roomId: string): Promise<SFURoom> {
    return {
      roomId,
      name: `Room ${roomId}`,
      createdAt: new Date(),
    };
  }

  async generateToken(roomId: string, userId: string, name: string): Promise<string> {
    return `stub-token:${roomId}:${userId}:${name}`;
  }

  async listParticipants(_roomId: string): Promise<SFUParticipant[]> {
    return [];
  }

  async removeParticipant(_roomId: string, _identity: string): Promise<void> {
    // No-op in stub mode
  }

  async muteParticipant(_roomId: string, _identity: string, _muted: boolean): Promise<void> {
    // No-op in stub mode
  }

  async muteAllParticipants(_roomId: string, _excludeIdentity?: string): Promise<void> {
    // No-op in stub mode
  }
}
