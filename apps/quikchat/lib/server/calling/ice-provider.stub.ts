/**
 * Stub ICE config provider — returns Google STUN servers (free, works for local
 * dev behind most NATs; won't work behind symmetric NATs or strict firewalls).
 * Active default until real coturn TURN is deployed.
 */
import type { IceConfigProvider } from "./ice-provider";

const GOOGLE_STUN_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export class StubIceConfigProvider implements IceConfigProvider {
  async getIceConfig(): Promise<{ iceServers: RTCIceServer[] }> {
    return { iceServers: GOOGLE_STUN_SERVERS };
  }
}
