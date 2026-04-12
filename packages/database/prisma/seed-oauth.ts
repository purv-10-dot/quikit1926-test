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

const APPS = [
  {
    slug: "quikscale",
    name: "QuikScale",
    description: "Scaling Up execution — KPI tracking, Priority management, OPSP, WWW, Meeting Rhythm, Performance.",
    baseUrl: process.env.QUIKSCALE_URL || "http://localhost:3004",
    iconUrl: null,
    status: "active",
    oauth: {
      clientId: "quikscale",
      clientSecretPlain: "quikscale-dev-secret-change-in-prod",
      redirectUris: [
        "http://localhost:3004/api/auth/callback/quikit",
      ],
      scopes: ["openid", "profile", "email", "tenant"],
    },
  },
  {
    slug: "admin",
    name: "Admin Portal",
    description: "Organization administration — user management, team setup, app access control, billing.",
    baseUrl: process.env.ADMIN_URL || "http://localhost:3005",
    iconUrl: null,
    status: "active",
    oauth: {
      clientId: "admin",
      clientSecretPlain: "admin-dev-secret-change-in-prod",
      redirectUris: [
        "http://localhost:3005/api/auth/callback/quikit",
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

    console.log(`     Secret (plain, for .env): ${appDef.oauth.clientSecretPlain}`);
    console.log(`     Redirect URIs: ${appDef.oauth.redirectUris.join(", ")}\n`);
  }

  console.log("🎉 Done! Add these to your app .env.local files:");
  console.log(`
# apps/quikscale/.env.local
QUIKIT_URL="http://localhost:3000"
QUIKIT_CLIENT_ID="quikscale"
QUIKIT_CLIENT_SECRET="quikscale-dev-secret-change-in-prod"

# apps/admin/.env.local
QUIKIT_URL="http://localhost:3000"
QUIKIT_CLIENT_ID="admin"
QUIKIT_CLIENT_SECRET="admin-dev-secret-change-in-prod"
`);
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
