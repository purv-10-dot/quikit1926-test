/**
 * Seed OAuth clients + App registry entries for dev.
 *
 * Run: cd packages/database && npx tsx prisma/seed-oauth.ts
 *
 * Creates:
 *   - App entries for QuikScale + Admin Portal
 *   - OAuthClient entries with dev redirect URIs + hashed secrets
 *
 * Idempotent — skips if already exists (upserts by slug/clientId).
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/**
 * Resolve an app's base URL for the App registry + OAuth redirect URI.
 *
 * In production we refuse to seed with localhost values — running this
 * script against a prod DB without QUIKSCALE_URL / ADMIN_URL set would
 * insert localhost into OAuth redirect URIs, silently breaking SSO for
 * every real user. Fail loud instead.
 */
function resolveAppUrl(envName: string, devFallback: string): string {
  const v = process.env[envName];
  if (v) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[seed-oauth] ${envName} is required when NODE_ENV=production. ` +
        `Seeding localhost into an OAuth redirect URI would break SSO for ` +
        `every user. Set it before re-running this script.`,
    );
  }
  return devFallback;
}

/**
 * Resolve an OAuth client secret. Required in production (no default).
 * In dev, falls back to a deterministic placeholder so local seeding works
 * without env setup, but the placeholder is clearly marked.
 */
function resolveClientSecret(envName: string, devFallback: string): string {
  const v = process.env[envName];
  if (v) return v;
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      `[seed-oauth] ${envName} is required when NODE_ENV=production. ` +
        `Refusing to seed a placeholder OAuth client secret in production.`,
    );
  }
  return devFallback;
}

const QUIKSCALE_BASE = resolveAppUrl("QUIKSCALE_URL", "http://localhost:3002"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl
const ADMIN_BASE = resolveAppUrl("ADMIN_URL", "http://localhost:3005"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl
const QUIKCONSTRUCTION_BASE = resolveAppUrl("QUIKCONSTRUCTION_URL", "http://localhost:3007"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl
const QUIKVC_BASE = resolveAppUrl("QUIKVC_URL", "http://localhost:3008"); // prod-safety-allow: dev fallback, prod throws via resolveAppUrl

const APPS = [
  {
    slug: "quikscale",
    name: "QuikScale",
    description: "Scaling Up execution — KPI tracking, Priority management, OPSP, WWW, Meeting Rhythm, Performance.",
    baseUrl: QUIKSCALE_BASE,
    iconUrl: "/app-icons/quikscale.png",
    status: "active",
    oauth: {
      clientId: "quikscale",
      clientSecretPlain: resolveClientSecret("QUIKSCALE_OAUTH_CLIENT_SECRET", "quikscale-dev-secret-change-in-prod"),
      redirectUris: [
        `${QUIKSCALE_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "admin",
    name: "Admin Portal",
    description: "Organization administration — user management, team setup, app access control, billing.",
    baseUrl: ADMIN_BASE,
    iconUrl: "/app-icons/admin.png",
    status: "active",
    oauth: {
      clientId: "admin",
      clientSecretPlain: resolveClientSecret("ADMIN_OAUTH_CLIENT_SECRET", "admin-dev-secret-change-in-prod"),
      redirectUris: [
        `${ADMIN_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "quikconstruction",
    name: "QuikConstruction",
    description: "Construction ERP — Projects, BOQ/DPR, Purchase, Store, Finance, HRMS, Safety, Quality.",
    baseUrl: QUIKCONSTRUCTION_BASE,
    iconUrl: "/app-icons/quikconstruction.png",
    status: "active",
    oauth: {
      clientId: "quikconstruction",
      clientSecretPlain: resolveClientSecret("QUIKCONSTRUCTION_OAUTH_CLIENT_SECRET", "quikconstruction-dev-secret-change-in-prod"),
      redirectUris: [
        `${QUIKCONSTRUCTION_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "quikvc",
    name: "QuikVC",
    description: "AI-powered VC operating system — sourcing, deal flow, IC memos, allocations, repayments.",
    baseUrl: QUIKVC_BASE,
    iconUrl: "/app-icons/quikvc.png",
    status: "active",
    oauth: {
      clientId: "quikvc",
      clientSecretPlain: resolveClientSecret("QUIKVC_OAUTH_CLIENT_SECRET", "quikvc-dev-secret-change-in-prod"),
      redirectUris: [
        `${QUIKVC_BASE}/api/auth/callback/quikit`,
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
];

async function main() {
  console.log("🔑 Seeding OAuth clients + App registry...\n");

  for (const appDef of APPS) {
    // Upsert App
    const app = await prisma.app.upsert({
      where: { slug: appDef.slug },
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
    console.log(`  ✅ App: ${app.name} (${app.slug}) → ${app.baseUrl}`);

    // Upsert OAuthClient
    const hashedSecret = await bcrypt.hash(appDef.oauth.clientSecretPlain, 12);

    const existing = await prisma.oAuthClient.findUnique({
      where: { clientId: appDef.oauth.clientId },
    });

    if (existing) {
      await prisma.oAuthClient.update({
        where: { clientId: appDef.oauth.clientId },
        data: {
          clientSecret: hashedSecret,
          redirectUris: appDef.oauth.redirectUris,
          scopes: appDef.oauth.scopes,
        },
      });
      console.log(`  ✅ OAuth client updated: ${appDef.oauth.clientId}`);
    } else {
      await prisma.oAuthClient.create({
        data: {
          appId: app.id,
          clientId: appDef.oauth.clientId,
          clientSecret: hashedSecret,
          redirectUris: appDef.oauth.redirectUris,
          scopes: appDef.oauth.scopes,
        },
      });
      console.log(`  ✅ OAuth client created: ${appDef.oauth.clientId}`);
    }

    console.log(`     Secret (plain, for .env): ${appDef.oauth.clientSecretPlain.length > 0 ? "[set]" : "[unset]"}  (${appDef.oauth.clientSecretPlain.startsWith("change-in-prod") || appDef.oauth.clientSecretPlain.endsWith("change-in-prod") ? "DEV PLACEHOLDER — rotate before prod" : "from env"})`);
    console.log(`     Redirect URIs: ${appDef.oauth.redirectUris.join(", ")}\n`);
  }

  console.log("🎉 Done! For each app, set in its .env.local:");
  const quikitUrlDev = "http://" + "localhost:3000"; // prod-safety-allow: printed dev instructions
  console.log(`
QUIKIT_URL="${quikitUrlDev}"
QUIKIT_CLIENT_ID="<app-slug>"
QUIKIT_CLIENT_SECRET="<value-from-secrets-vault>"

For the source of truth on secret values, see ~/Desktop/QuikIT-Secrets/ (vault).
Generate fresh secrets with:  openssl rand -base64 32
Then re-run this seed with the env vars set:
  QUIKSCALE_OAUTH_CLIENT_SECRET=... ADMIN_OAUTH_CLIENT_SECRET=... \\
  QUIKCONSTRUCTION_OAUTH_CLIENT_SECRET=... QUIKVC_OAUTH_CLIENT_SECRET=... \\
  npx tsx prisma/seed-oauth.ts
`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
