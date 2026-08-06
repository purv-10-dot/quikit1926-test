/**
 * Shared presence broadcast helpers. Both are pure relays to shared-channel
 * rooms — the gateway stays WRITE-FREE; these never touch the database.
 *
 *  - `broadcastConnectivity` emits the EPHEMERAL `presence` event (online /
 *    offline / on_call). Used on connect, disconnect (gateway.ts) and around the
 *    call lifecycle (calling.ts).
 *  - `broadcastSetStatus` emits the DURABLE `presence_status` event. Used on
 *    connect to seed observers with the connecting user's persisted status (read
 *    read-only from QcUserPresence). Live changes take the app → Redis → dispatch
 *    path instead; this only covers the connect-time seed.
 *
 * The room is ALWAYS built from `orgId` — a payload can never make an event
 * cross tenants.
 */
import type { Server as IOServer } from "socket.io";
import { channelRoom } from "./rooms";

export function broadcastConnectivity(
  io: IOServer,
  orgId: string,
  userId: string,
  channelIds: string[],
  status: "online" | "offline" | "on_call",
  lastSeen?: string,
): void {
  const payload = { userId, status, ...(lastSeen ? { lastSeen } : {}) };
  for (const id of channelIds) io.to(channelRoom(orgId, id)).emit("presence", payload);
}

export function broadcastSetStatus(
  io: IOServer,
  orgId: string,
  userId: string,
  channelIds: string[],
  status: string,
  statusMessage?: string | null,
  statusExpiresAt?: string | null,
): void {
  const payload = {
    userId,
    status,
    ...(statusMessage ? { statusMessage } : {}),
    ...(statusExpiresAt ? { statusExpiresAt } : {}),
  };
  for (const id of channelIds) io.to(channelRoom(orgId, id)).emit("presence_status", payload);
}
