/**
 * Register (or refresh) the QuikHRMS OAuth client in the CENTRAL auth DB.
 *
 * Why this lives in apps/quikhrms (not packages/database/prisma/seed-oauth.ts):
 * HRMS owns its own registration. This script *uses* the shared
 * `@quikit/database` client (it does not modify the shared package) to upsert:
 *   1. an `App` row   (slug "quikhrms") — so the launcher + UserAppAccess gate know HRMS
 *   2. an `OAuthClient` row (clientId "quikhrms") — so signIn("quikit") can exchange tokens
 *
 * It is idempotent (safe to re-run) and mirrors the conventions in
 * packages/database/prisma/seed-oauth.ts (prod-safety throws, bcrypt rounds=12,
 * scopes, redirect-uri shape). The central token route verifies the secret with
 * `bcrypt.compare`, so the stored secret must be a bcrypt hash.
 *
 * Run against the CENTRAL database (the one holding the `quikit`/`auth` schemas):
 *   DATABASE_URL=postgresql://...central... \
 *   QUIKHRMS_URL=http://localhost:3009 \
 *   QUIKHRMS_OAUTH_CLIENT_SECRET=$(openssl rand -base64 32) \
 *     npx tsx apps/quikhrms/scripts/register-oauth-client.ts
 *
 * Then put the SAME secret into HRMS's .env as QUIKIT_CLIENT_SECRET (and set
 * QUIKIT_URL / NEXT_PUBLIC_QUIKIT_URL to the central auth origin).
 *
 * Flags:
 *   DRY_RUN=1   preview only, no writes
 */

import { db } from "@quikit/database";
import bcrypt from "bcryptjs";

const CLIENT_ID = "quikhrms";
const APP_SLUG = "quikhrms";
const DRY_RUN = process.env.DRY_RUN === "1" || process.env.DRY_RUN === "true";
const IS_PROD = process.env.NODE_ENV === "production";

/** HRMS dev port is 3009 (see apps/quikhrms/package.json `next dev -p 3009`). */
function resolveBaseUrl(): string {
  const v = process.env.QUIKHRMS_URL;
  if (v) return v.replace(/\/$/, "");
  if (IS_PROD) {
    throw new Error(
      "[register-oauth-client] QUIKHRMS_URL is required when NODE_ENV=production. " +
        "Seeding a localhost redirect URI would break SSO for every user.",
    );
  }
  return "http://localhost:3009"; // prod-safety: dev fallback only; prod throws above
}

/** Secret required in prod; dev gets a clearly-marked placeholder. */
function resolveClientSecret(): string {
  const v = process.env.QUIKHRMS_OAUTH_CLIENT_SECRET;
  if (v) return v;
  if (IS_PROD) {
    throw new Error(
      "[register-oauth-client] QUIKHRMS_OAUTH_CLIENT_SECRET is required when " +
        "NODE_ENV=production. Refusing to seed a placeholder secret in production.",
    );
  }
  return "quikhrms-dev-secret-change-in-prod";
}

async function main() {
  const baseUrl = resolveBaseUrl();
  const secretPlain = resolveClientSecret();
  // NOTE: if HRMS runs under a basePath (NEXT_PUBLIC_BASE_PATH), the callback is
  // `${baseUrl}${basePath}/api/auth/callback/quikit`. Dev/prod use no basePath.
  const redirectUris = [`${baseUrl}/api/auth/callback/quikit`];
  const scopes = ["openid", "profile", "email", "tenant"];

  console.log(`🔑 Registering OAuth client "${CLIENT_ID}" (central DB)...`);
  console.log(`   App slug      : ${APP_SLUG}`);
  console.log(`   Redirect URIs : ${redirectUris.join(", ")}`);
  if (DRY_RUN) {
    console.log("   DRY_RUN=1 — no writes will happen.");
    return;
  }

  // 1. App row (idempotent by slug)
  const app = await db.app.upsert({
    where: { slug: APP_SLUG },
    update: {
      name: "QuikHRMS",
      description:
        "AI-native HR Management System — employees, leave, attendance, payroll, performance, recruitment.",
      baseUrl,
      status: "active",
    },
    create: {
      name: "QuikHRMS",
      slug: APP_SLUG,
      description:
        "AI-native HR Management System — employees, leave, attendance, payroll, performance, recruitment.",
      baseUrl,
      iconUrl: "/app-icons/quikhrms.png",
      status: "active",
    },
  });
  console.log(`✅ App: ${app.name} (${app.slug}) → ${app.baseUrl}`);

  // 2. OAuthClient row (idempotent by clientId; refreshes secret + redirectUris)
  const hashedSecret = await bcrypt.hash(secretPlain, 12);
  const existing = await db.oAuthClient.findUnique({ where: { clientId: CLIENT_ID } });
  if (existing) {
    await db.oAuthClient.update({
      where: { clientId: CLIENT_ID },
      data: { clientSecret: hashedSecret, redirectUris, scopes },
    });
    console.log(`✅ OAuth client updated: ${CLIENT_ID}`);
  } else {
    await db.oAuthClient.create({
      data: { appId: app.id, clientId: CLIENT_ID, clientSecret: hashedSecret, redirectUris, scopes },
    });
    console.log(`✅ OAuth client created: ${CLIENT_ID}`);
  }

  // 3. Optionally provision an org for HRMS so the launcher tile appears
  // (OrgAppAccess is default-off). Pass PROVISION_ORG_SLUG or PROVISION_ORG_ID.
  const provOrgId = process.env.PROVISION_ORG_ID;
  const provOrgSlug = process.env.PROVISION_ORG_SLUG;
  if (provOrgId || provOrgSlug) {
    const org = provOrgId
      ? await db.org.findUnique({ where: { id: provOrgId }, select: { id: true, name: true } })
      : await db.org.findUnique({ where: { slug: provOrgSlug! }, select: { id: true, name: true } });
    if (!org) {
      console.warn(`⚠️  Org not found (${provOrgId ?? provOrgSlug}) — skipped OrgAppAccess.`);
    } else {
      await db.orgAppAccess.upsert({
        where: { orgId_appId: { orgId: org.id, appId: app.id } },
        update: { enabled: true },
        create: { orgId: org.id, appId: app.id, enabled: true, reason: "HRMS rollout" },
      });
      console.log(`✅ OrgAppAccess enabled: ${org.name} → ${CLIENT_ID}`);
    }
  }

  const isPlaceholder = secretPlain.endsWith("change-in-prod");
  console.log("\n═══════════════════════════════════════════════════════════════");
  console.log("Put this in HRMS .env (and the matching central origin in QUIKIT_URL):");
  console.log("═══════════════════════════════════════════════════════════════");
  console.log(`QUIKIT_CLIENT_SECRET=${secretPlain}`);
  if (isPlaceholder) console.log("⚠️  DEV PLACEHOLDER secret — rotate before production.");
}

main()
  .then(() => db.$disconnect())
  .catch((e) => {
    console.error("❌ Failed:", e);
    db.$disconnect();
    process.exit(1);
  });
