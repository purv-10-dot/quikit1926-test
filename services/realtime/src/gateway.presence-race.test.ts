/**
 * Regression: a socket that dies WHILE the connect handler is still setting up.
 *
 * The connect handler does real work before the socket is usable — a user-room
 * join, `listChannelIdsForMember`, then `markOnline` and the snapshot queries.
 * `markOnline`'s `sadd` lands early in that sequence. If the `disconnect`
 * listener is registered after it (as it was), Socket.IO has already emitted the
 * event by the time the listener attaches and it never fires — so the socket id
 * is added to the presence set and NEVER removed.
 *
 * The orphan is not self-limiting. It does not age out, because every later
 * socket for that user calls `pexpire` on the same key and refreshes the TTL
 * underneath it. So the user's genuine last tab closes, `scard` still counts the
 * orphan, `lastSocket` comes back false, and neither the `presence:lastseen:`
 * write nor the `offline` broadcast happens — permanently, until the user has no
 * socket at all for a full TTL.
 *
 * That is the failure `__tests__/e2e/ui/last-seen.spec.ts` intermittently caught
 * from the other end (a last-seen timestamp hours stale after a real disconnect).
 * It is reachable in production: the gateway's own logs show this app opening
 * and closing sockets with sub-second lifetimes (891ms observed) as the client
 * tears down on view switches, and four sequential Prisma round-trips on a cold
 * pool comfortably outlast that.
 *
 * These tests slow the connect-time DB lookup to hold the window open
 * deterministically. The window's WIDTH is environmental; its existence was not.
 */
import type { AddressInfo } from "node:net";
import RedisMock from "ioredis-mock";
import jwt from "jsonwebtoken";
import { io as ioClient, type Socket } from "socket.io-client";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";

/** How long the connect handler's channel lookup blocks for. */
const DB_DELAY_MS = 600;
/** Disconnect this long after `connect` — comfortably inside DB_DELAY_MS. */
const KILL_AFTER_MS = 80;

vi.mock("@quikit/database", async () => {
  const real = await import("./testdb");
  return {
    ...real,
    db: {
      ...real.db,
      qcChannelMember: {
        ...real.db.qcChannelMember,
        findMany: async (args: Parameters<typeof real.db.qcChannelMember.findMany>[0]) => {
          const rows = await real.db.qcChannelMember.findMany(args);
          return new Promise((resolve) => setTimeout(() => resolve(rows), DB_DELAY_MS));
        },
      },
    },
  };
});

import { createGateway, type Gateway } from "./gateway";
import { createMetrics } from "./metrics";
import { lastSeenKey } from "./presence";
import { FIXTURES, resetStore } from "./testdb";

const { orgA, alice } = FIXTURES;
const SECRET = "test-realtime-secret";
const setKey = `presence:${orgA}:${alice}`;

let gateway: Gateway;
let url = "";
let presenceMock: InstanceType<typeof RedisMock>;
const openSockets: Socket[] = [];

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

function mintToken(userId: string, orgId: string): string {
  return jwt.sign({ userId, orgId }, SECRET, { expiresIn: "60s" });
}

function open(token: string): Socket {
  const s = ioClient(url, {
    auth: { token },
    transports: ["websocket"],
    reconnection: false,
    forceNew: true,
  });
  openSockets.push(s);
  return s;
}

/** Connect and abandon the socket mid-setup, before `ready` ever arrives. */
async function connectThenAbort(): Promise<void> {
  const s = open(mintToken(alice, orgA));
  let sawReady = false;
  s.on("ready", () => {
    sawReady = true;
  });
  await new Promise<void>((r) => s.on("connect", () => r()));
  await delay(KILL_AFTER_MS);
  s.disconnect();
  // The premise of the test: we really did land inside the setup window.
  expect(sawReady).toBe(false);
  // Let the server finish the setup it started, plus its release path.
  await delay(DB_DELAY_MS + 400);
}

/** Connect and wait for `ready` — a normal, fully established tab. */
function connectReady(): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = open(mintToken(alice, orgA));
    s.on("ready", () => resolve(s));
    s.on("connect_error", reject);
  });
}

beforeAll(async () => {
  presenceMock = new RedisMock();
  gateway = createGateway({
    tokenSecret: SECRET,
    allowedOrigins: "*",
    fanoutSubscriber: new RedisMock() as never,
    presenceRedis: presenceMock as never,
    healthCheck: () => true,
    metrics: createMetrics({ collectDefault: false }),
  });
  await new Promise<void>((resolve) => gateway.httpServer.listen(0, resolve));
  url = `http://localhost:${(gateway.httpServer.address() as AddressInfo).port}`;
});

afterEach(async () => {
  for (const s of openSockets.splice(0)) s.disconnect();
  await delay(120);
  // ioredis-mock shares one keyspace per process — clear it between tests.
  await (presenceMock as unknown as { flushall(): Promise<unknown> }).flushall();
  resetStore();
});

afterAll(async () => {
  await gateway.close();
  await presenceMock.quit();
});

describe("socket that dies during the connect handler", () => {
  it("leaves nothing behind in the presence set", async () => {
    await connectThenAbort();
    expect(await presenceMock.smembers(setKey)).toEqual([]);
  });

  it("does not block the NEXT tab's offline transition (the last-seen bug)", async () => {
    // The orphan from an aborted connect used to survive here and keep `scard`
    // above zero forever, so the real tab's close was never a 1→0 transition.
    await connectThenAbort();

    const tab = await connectReady();
    expect(await presenceMock.smembers(setKey)).toEqual([tab.id]);

    tab.disconnect();
    await delay(300);

    expect(await presenceMock.smembers(setKey)).toEqual([]);
    const lastSeen = await presenceMock.get(lastSeenKey(orgA, alice));
    expect(lastSeen).toBeTruthy();
    expect(Number.isNaN(Date.parse(lastSeen as string))).toBe(false);
  });

  it("does not strand a LIVE tab when a second, aborted one dies mid-setup", async () => {
    // The mirror-image risk of registering the listener early: the aborted
    // socket's release must remove only its OWN id, never the live tab's.
    const tab = await connectReady();
    await connectThenAbort();

    expect(await presenceMock.smembers(setKey)).toEqual([tab.id]);
    // Nothing was written yet — the user never went offline.
    expect(await presenceMock.get(lastSeenKey(orgA, alice))).toBeNull();
  });
});
