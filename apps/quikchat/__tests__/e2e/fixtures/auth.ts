/**
 * Session minting + identity resolution for QuikChat E2E tests.
 *
 * QuikChat is an OAuth *consumer*: `app/login/page.tsx` immediately calls
 * `signIn("quikit")`, which bounces to the central login app (:3001) and the IdP
 * (:3000). There is no credentials form to drive, so a UI login would couple
 * every run to two more apps. Instead we mint the NextAuth session cookie
 * directly with the same `NEXTAUTH_SECRET` the app validates against — the same
 * approach `apps/quiklms/__tests__/e2e/fixtures/auth.ts` takes.
 *
 * TWO NON-OBVIOUS RULES, both load-bearing:
 *
 *  1. The minted token carries NO `sessionId` claim. Both `verifyJWT()`
 *     (packages/auth/jwt.ts) and the OAuth-client `jwt` callback short-circuit
 *     their Redis soft-revocation check only when `sessionId` is ABSENT. Include
 *     one and they look for a live `auth-session` key that only the real IdP
 *     mints — Redis is up in dev, the key is missing, and every request 401s.
 *
 *  2. `id` must be the platform User id: `lib/session.ts` projects the session to
 *     `{ userId: session.user.id, orgId: session.user.orgId }`, and every
 *     `withOrgAuth` route scopes its queries by that pair.
 *
 * Identities are resolved from the DB by email rather than hardcoded, because
 * QuikChat has no E2E seed script / seed manifest — these are the shared dev-seed
 * accounts, whose cuids differ on every machine. We talk to `@prisma/client`
 * directly (not `@quikit/database`, whose package entry is a raw `index.ts` that
 * Playwright will not transpile out of `node_modules`).
 */

import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { encode } from "next-auth/jwt";
import type { Browser, BrowserContext, Page } from "@playwright/test";

/** apps/quikchat — this file lives at `__tests__/e2e/fixtures/auth.ts`. */
const APP_DIR = path.join(__dirname, "..", "..", "..");
const ENV_PATH = path.join(APP_DIR, ".env.local");

/**
 * Single source of truth for the app origin, shared with `playwright.config.ts`.
 * Contexts created by hand via `browser.newContext()` do NOT inherit the
 * project's `use.baseURL`, so `signInAs` passes it explicitly.
 */
export const BASE_URL = process.env.E2E_BASE_URL ?? "http://localhost:3011";

// ---------------------------------------------------------------------------
// .env.local
// ---------------------------------------------------------------------------

let envText: string | null = null;

/** Read a key out of the app's `.env.local` (tests don't load Next's env). */
function readEnv(key: string): string | undefined {
  if (envText == null) {
    if (!fs.existsSync(ENV_PATH)) {
      throw new Error(`Missing ${ENV_PATH} — copy .env.example and fill it in.`);
    }
    // Strip the BOM: this file starts with one, which would otherwise make the
    // `^KEY=` anchor miss the very first entry (DATABASE_URL, on line 1).
    envText = fs.readFileSync(ENV_PATH, "utf8").replace(/^﻿/, "");
  }
  const m = envText.match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

function requireEnv(key: string): string {
  const v = readEnv(key);
  if (!v) throw new Error(`${key} not found in ${ENV_PATH}`);
  return v;
}

/** The realtime gateway's HTTP origin, derived from the ws:// URL the app uses. */
export function realtimeHttpUrl(): string {
  const ws = readEnv("NEXT_PUBLIC_REALTIME_WS_URL") ?? "ws://localhost:3099";
  return ws.replace(/^ws/, "http");
}

// ---------------------------------------------------------------------------
// DB access
// ---------------------------------------------------------------------------

let prisma: PrismaClient | null = null;

function db(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      datasources: { db: { url: requireEnv("DATABASE_URL") } },
    });
  }
  return prisma;
}

let redis: Redis | null = null;

/**
 * Read-only Redis handle for the gateway-owned presence keys. Same instance and
 * same read-only posture as `lib/server/presence-redis.ts` — tests never write
 * ephemeral presence, only observe it.
 */
function presenceRedis(): Redis {
  if (!redis) redis = new Redis(readEnv("REDIS_URL") ?? "redis://localhost:6379");
  return redis;
}

/** Release the pool + Redis — call from `test.afterAll` or the run hangs on exit. */
export async function closeDb(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
  if (redis) {
    await redis.quit();
    redis = null;
  }
}

// ---------------------------------------------------------------------------
// Identities
// ---------------------------------------------------------------------------

/**
 * The shared dev-seed users. NOTE: `dhwani` / `pravin` / `rishab` authenticate
 * with `Test@123` if you ever need a real IdP login; `ashwin`'s stored hash is
 * something else. Irrelevant to cookie minting, recorded so nobody re-discovers
 * it the hard way.
 */
export type Who = "dhwani" | "pravin" | "rishab" | "ashwin";

const EMAIL: Record<Who, string> = {
  dhwani: "dhwani@moreyeahs.com",
  pravin: "pravin@moreyeahs.com",
  rishab: "rishab@moreyeahs.com",
  ashwin: "ashwin@moreyeahs.com",
};

export interface Identity {
  who: Who;
  userId: string;
  orgId: string;
  email: string;
  displayName: string;
  membershipRole: string;
}

const identityCache = new Map<Who, Identity>();

/** Resolve a seeded user + their active org membership. Memoized per process. */
export async function resolveIdentity(who: Who): Promise<Identity> {
  const cached = identityCache.get(who);
  if (cached) return cached;

  const email = EMAIL[who];
  const user = await db().user.findUnique({
    where: { email },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  if (!user) {
    throw new Error(
      `Seeded user ${email} not found in the dev database. These E2E tests run ` +
        `against the shared dev seed — restore it before running them.`,
    );
  }

  const memberships = await db().orgMember.findMany({
    where: { userId: user.id },
    select: { orgId: true, role: true, status: true },
  });
  const active = memberships.find((m) => m.status === "active") ?? memberships[0];
  if (!active) throw new Error(`${email} has no OrgMember row — cannot mint an org-scoped session.`);

  const identity: Identity = {
    who,
    userId: user.id,
    orgId: active.orgId,
    email: user.email,
    displayName: [user.firstName, user.lastName].filter(Boolean).join(" ") || who,
    membershipRole: active.role,
  };
  identityCache.set(who, identity);
  return identity;
}

/**
 * The 1:1 DM channel shared by two users. Resolved rather than created: the dev
 * seed already has one, and creating channels from a test would leave debris in
 * a workspace people use by hand.
 */
export async function findDmChannelId(a: Identity, b: Identity): Promise<string> {
  const mine = await db().qcChannelMember.findMany({
    where: { orgId: a.orgId, userId: a.userId },
    select: { channelId: true },
  });
  const shared = await db().qcChannelMember.findMany({
    where: { orgId: b.orgId, userId: b.userId, channelId: { in: mine.map((m) => m.channelId) } },
    select: { channelId: true },
  });
  const dm = await db().qcChannel.findFirst({
    where: { id: { in: shared.map((s) => s.channelId) }, type: "dm" },
    select: { id: true },
  });
  if (!dm) {
    throw new Error(
      `No DM channel exists between ${a.email} and ${b.email}. Open one once in ` +
        `the UI (New chat → ${b.displayName}) and re-run.`,
    );
  }
  return dm.id;
}

// ---------------------------------------------------------------------------
// Session cookie
// ---------------------------------------------------------------------------

/** NextAuth drops the `__Secure-` prefix on http origins. */
function cookieName(baseURL: string): string {
  return baseURL.startsWith("https:")
    ? "__Secure-next-auth.session-token"
    : "next-auth.session-token";
}

export async function mintSessionToken(identity: Identity): Promise<string> {
  return encode({
    secret: requireEnv("NEXTAUTH_SECRET"),
    maxAge: 8 * 60 * 60,
    token: {
      id: identity.userId,
      sub: identity.userId,
      email: identity.email,
      name: identity.displayName,
      orgId: identity.orgId,
      membershipRole: identity.membershipRole,
      // OAuth-client sessions never inherit super-admin (createOAuthClientOptions
      // hardcodes false) — mirror that so the fixture can't over-privilege.
      isSuperAdmin: false,
      actingAs: "user",
      // Deliberately NO sessionId — see the file header, rule (1).
    },
  });
}

/** A Playwright storageState carrying `identity`'s session cookie. */
export async function storageStateFor(identity: Identity, baseURL = BASE_URL) {
  const token = await mintSessionToken(identity);
  return {
    cookies: [
      {
        name: cookieName(baseURL),
        value: token,
        domain: new URL(baseURL).hostname,
        path: "/",
        expires: Math.floor(Date.now() / 1000) + 8 * 3600,
        httpOnly: true,
        secure: baseURL.startsWith("https:"),
        sameSite: "Lax" as const,
      },
    ],
    origins: [],
  };
}

export interface Session {
  identity: Identity;
  context: BrowserContext;
  page: Page;
}

/**
 * A fresh browser context already signed in as `who`, plus one page.
 *
 * Each identity needs its OWN context: the session cookie is per-context, and
 * presence is per-socket, so "two people in the same DM" means two contexts.
 * Closing the context is how a test takes someone offline.
 */
export async function signInAs(browser: Browser, who: Who, baseURL = BASE_URL): Promise<Session> {
  const identity = await resolveIdentity(who);
  const context = await browser.newContext({
    baseURL,
    storageState: await storageStateFor(identity, baseURL),
  });
  return { identity, context, page: await context.newPage() };
}

// ---------------------------------------------------------------------------
// Server-side helpers (no browser needed)
// ---------------------------------------------------------------------------

export interface MyPresence {
  status: string;
  statusMessage: string | null;
  statusExpiresAt: string | null;
  shareLastSeen: boolean;
}

/** `GET /api/me/presence` as `identity` — the persisted truth behind the UI. */
export async function getMyPresence(identity: Identity, baseURL = BASE_URL): Promise<MyPresence> {
  const token = await mintSessionToken(identity);
  const res = await fetch(`${baseURL}/api/me/presence`, {
    headers: { cookie: `${cookieName(baseURL)}=${token}` },
  });
  if (!res.ok) {
    throw new Error(
      `GET /api/me/presence for ${identity.email} failed: ${res.status} ${await res.text()}`,
    );
  }
  return (await res.json()) as MyPresence;
}

/**
 * `PUT /api/me/presence` as `identity` — used to put the shared dev-seed rows
 * into a known state before a test and to restore them afterwards. Omitting
 * `status` is a privacy-only patch: the route leaves status/message/expiry alone.
 */
export async function putMyPresence(
  identity: Identity,
  patch: { status?: string; statusMessage?: string | null; expiresAt?: string | null; shareLastSeen?: boolean },
  baseURL = BASE_URL,
): Promise<void> {
  const token = await mintSessionToken(identity);
  const res = await fetch(`${baseURL}/api/me/presence`, {
    method: "PUT",
    headers: {
      cookie: `${cookieName(baseURL)}=${token}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    throw new Error(
      `PUT /api/me/presence for ${identity.email} failed: ${res.status} ${await res.text()}`,
    );
  }
}

/**
 * Does this user hold a live socket right now, anywhere?
 *
 * Mirrors the gateway's own `presence:{orgId}:{userId}` socket-set key
 * (services/realtime/src/presence.ts). A present key means at least one socket is
 * alive and heartbeating.
 */
export async function hasLiveSocket(identity: Identity): Promise<boolean> {
  return (await presenceRedis().exists(`presence:${identity.orgId}:${identity.userId}`)) === 1;
}

/**
 * The durable last-seen instant the gateway recorded for this user, or null.
 *
 * Reads the gateway-owned `presence:lastseen:{orgId}:{userId}` key — the same key
 * `lib/server/presence-redis.ts` reads, and the raw pre-privacy value. Lets a test
 * assert that a disconnect actually recorded a FRESH timestamp, independently of
 * whether the UI's cache got around to showing it.
 */
export async function readLastSeen(identity: Identity): Promise<string | null> {
  return presenceRedis().get(`presence:lastseen:${identity.orgId}:${identity.userId}`);
}

/**
 * Refuse to run a presence test whose SUBJECT is already online elsewhere.
 *
 * Presence is per USER, not per browser context: `markOffline()` broadcasts the
 * offline transition only when the user's socket set empties (`scard === 0`). So
 * one stray tab — your own dev browser signed in as this person, the desktop app,
 * a leftover run — silently defeats "close the context and watch them go
 * offline". Worse, it defeats it *quietly*: the "both online" step still passes
 * (via the observer's connect-time snapshot), and the failure surfaces one step
 * later as a header that just won't change.
 *
 * Only the SUBJECT needs exclusivity. The observer may be signed in elsewhere all
 * day — nothing asserts their presence.
 */
export async function assertSoleSessionOwner(identity: Identity): Promise<void> {
  if (!(await hasLiveSocket(identity))) return;
  throw new Error(
    `${identity.email} already has a live realtime socket, so this test cannot take ` +
      `them offline (presence is per-user: the gateway only broadcasts "offline" when ` +
      `the user's LAST socket closes).\n` +
      `Fix by either:\n` +
      `  • closing any browser tab / desktop app signed in as ${identity.displayName}, or\n` +
      `  • running against a different pair, e.g. E2E_DM_SUBJECT=rishab E2E_DM_OBSERVER=ashwin\n` +
      `The durable fix is a dedicated QuikChat E2E seed (users nobody logs into by hand), ` +
      `the way apps/quiklms uses prisma/seed-quiklms-e2e.ts.`,
  );
}

/**
 * Fail fast, and legibly, when the realtime gateway can't reach Redis.
 *
 * `playwright.config.ts` gates on the gateway's `/metrics` (process liveness)
 * rather than `/health`, because `/health` returns 503 when Redis is down — which
 * would make Playwright's webServer sit there retrying and then time out with a
 * message about a URL, not about Redis. Presence is Redis-only (the gateway is
 * its sole writer), so a presence test without Redis isn't a failure worth
 * debugging — it's a missing dependency, and it should say so.
 */
export async function assertGatewayHealthy(): Promise<void> {
  const url = `${realtimeHttpUrl()}/health`;
  let body: { status?: string; redis?: boolean; fanoutSubscriber?: boolean };
  try {
    body = (await (await fetch(url)).json()) as typeof body;
  } catch (e) {
    throw new Error(
      `Realtime gateway unreachable at ${url} (${e instanceof Error ? e.message : e}). ` +
        `Start it with: npm run dev --workspace @quikit/realtime-gateway`,
    );
  }
  if (body.redis !== true) {
    throw new Error(
      `Realtime gateway is up but Redis is not (${JSON.stringify(body)}). Presence and ` +
        `last-seen are Redis-only — start Redis at ${readEnv("REDIS_URL") ?? "redis://localhost:6379"}.`,
    );
  }
}
