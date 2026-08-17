/**
 * Reproduces the "fan-out delivered twice" bug from a real two-replica
 * deployment: every replica subscribes to `quikchat:fanout`, and (with the
 * Redis Socket.IO adapter attached) an un-flagged `io.to(room).emit(...)` is
 * NOT node-local — it re-broadcasts to every node in the cluster. So N
 * replicas each independently dispatching the same fan-out message means a
 * socket connected to exactly one replica received the event N times.
 *
 * This is impossible to catch with a single `createGateway` instance (every
 * existing gateway test runs one), so this file spins up two. It can't use
 * the real `@socket.io/redis-adapter` + a Redis/ioredis-mock pub-sub — that
 * adapter speaks a binary wire protocol on top of Redis and doesn't add
 * anything a unit test needs to assert. Instead it uses a minimal adapter
 * double, `BusAdapter`, that extends socket.io-adapter's base `Adapter` the
 * same way the real Redis adapter does: local delivery is untouched (the base
 * class's `broadcast()` already ignores `flags.local` and only ever touches
 * this node's own socket table — see socket-io-adapter's in-memory-adapter.js),
 * and a non-local broadcast is additionally forwarded to sibling adapters
 * marked `local: true` so they deliver to THEIR local sockets too. That is
 * exactly the cross-node semantics `@socket.io/redis-adapter` provides, so a
 * bug that only reproduces under a real adapter reproduces here too, and a fix
 * that relies on the `.local` broadcast flag is genuinely exercised.
 */
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { Adapter } from "socket.io-adapter";
import type { Namespace } from "socket.io";
import jwt from "jsonwebtoken";
import { io as ioClient, type Socket } from "socket.io-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// gateway.ts -> calling.ts -> @quikit/database eagerly builds a PrismaClient at
// import time; mock it so this test needs no DATABASE_URL / live DB.
import { vi } from "vitest";
vi.mock("@quikit/database", async () => await import("./testdb"));

import { createGateway, type Gateway } from "./gateway";
import { createMetrics } from "./metrics";
import type { FanoutEvent } from "./fanout-contract";
import { FANOUT_CHANNEL } from "./fanout-contract";

const SECRET = "test-realtime-multiinstance-secret";
const ORG = "org-multi";
const ALICE = "u-alice-multi";

// --- BusAdapter: an in-process double for a cluster-wide Redis adapter ----
// (see file header for why this is a faithful stand-in for the real thing).
class BusAdapter extends Adapter {
  private readonly bus: BusAdapter[];

  constructor(nsp: Namespace, bus: BusAdapter[]) {
    super(nsp);
    this.bus = bus;
    bus.push(this);
  }

  override broadcast(packet: unknown, opts: Parameters<Adapter["broadcast"]>[1]): void {
    super.broadcast(packet, opts);
    if (opts.flags?.local) return;
    for (const sibling of this.bus) {
      if (sibling === this) continue;
      sibling.broadcast(packet, { ...opts, flags: { ...opts.flags, local: true } });
    }
  }
}

function createBusAdapterFactory(bus: BusAdapter[]) {
  // Must be a plain `function`, not an arrow: socket.io calls this factory
  // with `new`, the same way `@socket.io/redis-adapter`'s createAdapter()
  // does (`new (this.server.adapter())(this)` in socket.io's namespace init).
  return function (nsp: Namespace) {
    return new BusAdapter(nsp, bus);
  };
}

/** Every replica subscribes to the same fan-out channel; publishing invokes
 *  every registered listener synchronously, exactly like N replicas each
 *  independently receiving the same Redis pub/sub message. */
function createSharedFanoutBus() {
  const listeners: Array<(channel: string, message: string) => void> = [];
  return {
    subscribe: async () => undefined,
    on: (_event: "message", listener: (channel: string, message: string) => void) => {
      listeners.push(listener);
    },
    publish: (channel: string, message: string) => {
      for (const l of listeners) l(channel, message);
    },
  };
}

function mintToken(userId: string, orgId: string): string {
  return jwt.sign({ userId, orgId }, SECRET, { expiresIn: "60s" });
}

async function startGateway(bus: BusAdapter[], fanoutSubscriber: unknown): Promise<{ gateway: Gateway; url: string }> {
  const gateway = createGateway({
    tokenSecret: SECRET,
    allowedOrigins: "*",
    fanoutSubscriber: fanoutSubscriber as never,
    adapterFactory: createBusAdapterFactory(bus) as never,
    healthCheck: () => true,
    metrics: createMetrics({ collectDefault: false }),
    httpServer: createServer(),
  });
  await new Promise<void>((resolve) => gateway.httpServer.listen(0, resolve));
  const url = `http://localhost:${(gateway.httpServer.address() as AddressInfo).port}`;
  return { gateway, url };
}

function connectReady(url: string, token: string): Promise<Socket> {
  return new Promise((resolve, reject) => {
    const s = ioClient(url, {
      auth: { token },
      transports: ["websocket"],
      reconnection: false,
      forceNew: true,
    });
    s.on("ready", () => resolve(s));
    s.on("connect_error", reject);
  });
}

const delay = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe("two-replica cluster: fan-out is delivered exactly once", () => {
  let gwA: Gateway;
  let gwB: Gateway;
  let urlA: string;
  let client: Socket;
  let publish: (evt: FanoutEvent) => void;

  beforeAll(async () => {
    const bus: BusAdapter[] = [];
    const sharedFanoutBus = createSharedFanoutBus();

    const a = await startGateway(bus, sharedFanoutBus);
    const b = await startGateway(bus, sharedFanoutBus);
    gwA = a.gateway;
    gwB = b.gateway;
    urlA = a.url;

    // The client connects to replica A ONLY — replica B never sees this
    // socket. Both replicas nonetheless receive every fan-out message (they
    // share `sharedFanoutBus`), and both sit behind the same cluster adapter
    // (they share `bus`), matching the UAT topology in the bug report.
    client = await connectReady(urlA, mintToken(ALICE, ORG));

    publish = (evt) => sharedFanoutBus.publish(FANOUT_CHANNEL, JSON.stringify(evt));
  });

  afterAll(async () => {
    client.disconnect();
    await gwA.close();
    await gwB.close();
  });

  it("a `notification` published once is received by the client exactly once, not once per replica", async () => {
    const received: unknown[] = [];
    client.on("notification", (payload) => received.push(payload));

    const payload = { id: "n-multi-1", type: "mention" };
    publish({ orgId: ORG, channelId: "irrelevant", event: "notification", payload, userId: ALICE });

    // Give both replicas' listeners (and any adapter forwarding) time to run.
    await delay(200);

    expect(received).toEqual([payload]);
  });
});
