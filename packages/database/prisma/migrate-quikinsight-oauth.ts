/**
 * Standalone migration: registers ONLY the "quikinsight" App + OAuthClient
 * rows. A minimal, provably-scoped alternative to running the full
 * seed-oauth.ts (which iterates over every app in its APPS array) — safe to
 * run against a real UAT database without risk of touching any other app's
 * row.
 *
 * Background: seed-oauth.ts added the "quikinsight" entry mid-session
 * (see packages/database/prisma/seed-oauth.ts's APPS array, slug
 * "quikinsight") for the local/test Neon database. If UAT's OAuthClient
 * table has no "quikinsight" row, QuikInsight's SSO
 * (/api/auth/callback/quikit) and its Meta OAuth callback
 * (/api/oauth/meta/callback) will not work there. This script inserts that
 * one missing row (and its App registry row, required for the app launcher
 * tile) — nothing else.
 *
 * Run: cd packages/database && npx tsx prisma/migrate-quikinsight-oauth.ts
 *
 * Idempotent — upserts by slug ("quikinsight") / clientId ("quikinsight").
 * Safe to re-run.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SLUG = "quikinsight";
const CLIENT_ID = "quikinsight";

/**
 * Resolve QuikInsight's base URL from whichever env var is actually set
 * wherever this script runs, so it produces UAT-correct URLs on UAT and
 * test-deployment URLs on the test Neon setup — never a hardcoded value.
 *
 * QUIKINSIGHT_URL is the primary/canonical base (mirrors every other app's
 * *_URL convention in seed-oauth.ts). QUIKIT_URL is read separately below,
 * only for the icon URL (same pattern seed-oauth.ts uses for other apps
 * whose icon lives on the central launcher).
 */
function resolveBaseUrl(): string {
  const v = process.env.QUIKINSIGHT_URL;
  if (v) return v.replace(/\/$/, "");
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "[migrate-quikinsight-oauth] QUIKINSIGHT_URL is required when NODE_ENV=production. " +
        "Seeding localhost into an OAuth redirect URI would break SSO for every user. " +
        "Set it before re-running this script.",
    );
  }
  return "http://localhost:3015";
}

/**
 * Extra deployed origin (e.g. a Vercel preview/test deployment), registered
 * ALONGSIDE the primary base URL, not instead of it — same convention as
 * seed-oauth.ts's QUIKINSIGHT_DEPLOYED_URL. Optional; omitted entirely when
 * not set, so a UAT run with only QUIKINSIGHT_URL set produces exactly one
 * origin's worth of redirect URIs.
 */
function resolveDeployedUrl(): string | undefined {
  return process.env.QUIKINSIGHT_DEPLOYED_URL?.replace(/\/$/, "");
}

/**
 * Resolve the OAuth client secret. REQUIRED outside local dev — this script
 * refuses to seed the placeholder dev secret into any database that isn't
 * plain local development, since that would leave a real (UAT/prod)
 * database with a publicly-known client secret.
 *
 * "Non-dev context" is intentionally broader than just NODE_ENV=production:
 * anyone running this against UAT is very unlikely to also have
 * NODE_ENV=production set (UAT is usually NODE_ENV=production for the app
 * runtime, but this script has no way to distinguish "local dev seeding" from
 * "someone pointed DATABASE_URL at UAT" other than the presence of this env
 * var) — so the safe default is to REQUIRE the real secret unless the caller
 * explicitly opts into the dev placeholder.
 */
function resolveClientSecret(): string {
  const v = process.env.QUIKINSIGHT_OAUTH_CLIENT_SECRET;
  if (v) return v;
  const allowDevPlaceholder = process.env.ALLOW_DEV_OAUTH_SECRET === "true";
  if (allowDevPlaceholder) return "quikinsight-dev-secret-change-in-prod";
  throw new Error(
    "[migrate-quikinsight-oauth] QUIKINSIGHT_OAUTH_CLIENT_SECRET is not set.\n" +
      "Refusing to seed a placeholder OAuth client secret into this database.\n" +
      "Set QUIKINSIGHT_OAUTH_CLIENT_SECRET to the real secret before running this " +
      "against UAT (see ~/Desktop/QuikIT-Secrets/ for the source of truth),\n" +
      "or set ALLOW_DEV_OAUTH_SECRET=true if you genuinely intend to seed the " +
      "dev placeholder into a local/throwaway database.",
  );
}

async function main() {
  console.log("🔑 Migrating QuikInsight App + OAuthClient (scoped to this one app only)...\n");

  const baseUrl = resolveBaseUrl();
  const deployedUrl = resolveDeployedUrl();
  const quikitBase = (process.env.QUIKIT_URL ?? "http://localhost:3000").replace(/\/$/, "");
  const clientSecretPlain = resolveClientSecret();

  const redirectUris = [
    `${baseUrl}/api/oauth/meta/callback`,
    `${baseUrl}/api/auth/callback/quikit`,
    ...(deployedUrl
      ? [
          `${deployedUrl}/api/oauth/meta/callback`,
          `${deployedUrl}/api/auth/callback/quikit`,
        ]
      : []),
  ];

  const appDef = {
    slug: SLUG,
    name: "QuikInsight",
    description: "Marketing analytics — unifies analytics, ads, social, and CRM into one live dashboard.",
    baseUrl,
    iconUrl: `${quikitBase}/app-icons/quikinsight.svg`,
    status: "active",
  };

  // ── App registry row ────────────────────────────────────────────────────
  // Required for the app launcher tile (App.iconUrl/baseUrl/status feed the
  // tile grid) — confirmed by seed-oauth.ts's pattern, where every OAuthClient
  // is created with `appId` pointing at its App row (App 1:N OAuthClient).
  const existingApp = await prisma.app.findUnique({ where: { slug: SLUG } });

  const app = await prisma.app.upsert({
    where: { slug: SLUG },
    update: {
      name: appDef.name,
      description: appDef.description,
      baseUrl: appDef.baseUrl,
      status: appDef.status,
    },
    create: {
      name: appDef.name,
      slug: appDef.slug,
      description: appDef.description,
      baseUrl: appDef.baseUrl,
      iconUrl: appDef.iconUrl,
      status: appDef.status,
    },
  });

  console.log(`  ${existingApp ? "✏️  App updated" : "✅ App created"}: ${app.name} (${app.slug})`);
  console.log(`     baseUrl: ${app.baseUrl}`);
  console.log(`     status:  ${app.status}\n`);

  // ── OAuthClient row ─────────────────────────────────────────────────────
  const hashedSecret = await bcrypt.hash(clientSecretPlain, 12);

  const existingClient = await prisma.oAuthClient.findUnique({
    where: { clientId: CLIENT_ID },
  });

  if (existingClient) {
    await prisma.oAuthClient.update({
      where: { clientId: CLIENT_ID },
      data: {
        clientSecret: hashedSecret,
        redirectUris,
        scopes: ["openid", "profile", "email", "tenant"],
      },
    });
    console.log(`  ✏️  OAuthClient updated: ${CLIENT_ID}`);
  } else {
    await prisma.oAuthClient.create({
      data: {
        appId: app.id,
        clientId: CLIENT_ID,
        clientSecret: hashedSecret,
        redirectUris,
        scopes: ["openid", "profile", "email", "tenant"],
      },
    });
    console.log(`  ✅ OAuthClient created: ${CLIENT_ID}`);
  }

  console.log(`     Redirect URIs:`);
  for (const uri of redirectUris) console.log(`       - ${uri}`);
  console.log(
    `     Secret source: ${
      process.env.QUIKINSIGHT_OAUTH_CLIENT_SECRET
        ? "QUIKINSIGHT_OAUTH_CLIENT_SECRET env var"
        : "DEV PLACEHOLDER (ALLOW_DEV_OAUTH_SECRET=true) — do not use on UAT/prod"
    }`,
  );

  console.log(
    `\n🎉 Done. Scope check: this script only ever queries/writes the row where ` +
      `slug/clientId = "${SLUG}" — no other app's App or OAuthClient row was read or touched.`,
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
