/**
 * Moreyeahs — minimal user seed for QuikChat testing.
 *
 * Trimmed from seed-moreyeahs.ts: keeps ONLY the user/membership/app-access
 * logic (no QuikScale/QuikTrack/QuikSocial/QuikInfra domain seeding, no
 * QuikInfra Prisma client import — which is why the full seed fails on a
 * machine where apps/quikinfra/node_modules/.prisma-qc/client isn't generated).
 *
 * Adds three users to the existing Moreyeahs org:
 *   - dhwani@moreyeahs.com  → org_admin
 *   - pravin@moreyeahs.com  → member
 *   - rishab@moreyeahs.com  → member
 *
 * Ashwin (existing super-admin) is preserved as-is.
 *
 * Grants UserAppAccess for quikchat + quiktrack + quikcrm + quikscale to all
 * four members, so they are genuinely "users of other apps who also use
 * QuikChat", and can log into QuikChat directly too.
 *
 * Idempotent (upserts). Run from repo root:
 *   cd packages/database && npx tsx prisma/seed-moreyeahs-chat.ts
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const db = new PrismaClient();

const ORG_SLUG = "moreyeahs";
const PASSWORD = "Test@123";
const ASHWIN_EMAIL = "ashwin@moreyeahs.com";

const APP_SLUGS = ["quikchat", "quiktrack", "quikcrm", "quikscale"];

const NEW_USERS = [
  { email: "dhwani@moreyeahs.com", firstName: "Dhwani", lastName: "Patel", role: "org_admin" },
  { email: "pravin@moreyeahs.com", firstName: "Pravin", lastName: "Sharma", role: "member" },
  { email: "rishab@moreyeahs.com", firstName: "Rishab", lastName: "Khan", role: "member" },
];

async function main() {
  console.log("🌱 Moreyeahs QuikChat user seed");

  const org = await db.org.findUnique({ where: { slug: ORG_SLUG } });
  if (!org) throw new Error(`Org "${ORG_SLUG}" not found — aborting`);
  console.log(`✅ Org: ${org.name} (${org.id})`);

  const hashed = await bcrypt.hash(PASSWORD, 10);

  // Ashwin must already exist (from seed-superadmin.ts).
  const ashwin = await db.user.findUnique({ where: { email: ASHWIN_EMAIL } });
  if (!ashwin) throw new Error(`${ASHWIN_EMAIL} not found — run seed-superadmin.ts first`);

  const userIds: Record<string, string> = { [ASHWIN_EMAIL]: ashwin.id };

  // 1. Upsert the three users.
  for (const u of NEW_USERS) {
    const user = await db.user.upsert({
      where: { email: u.email },
      update: { firstName: u.firstName, lastName: u.lastName, password: hashed, emailVerified: new Date() },
      create: {
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        password: hashed,
        emailVerified: new Date(),
        themeMode: "light",
        accentColor: "#0066cc",
      },
    });
    userIds[u.email] = user.id;
    console.log(`  ✓ user: ${u.email} (${u.role})`);
  }

  // 2. Memberships.
  for (const u of NEW_USERS) {
    await db.orgMember.upsert({
      where: { orgId_userId: { orgId: org.id, userId: userIds[u.email]! } },
      update: { role: u.role, status: "active" },
      create: { orgId: org.id, userId: userIds[u.email]!, role: u.role, status: "active", acceptedAt: new Date() },
    });
  }

  // 3. UserAppAccess for the listed apps — for ashwin AND the three new users.
  const apps = await db.app.findMany({ where: { slug: { in: APP_SLUGS } } });
  if (apps.length !== APP_SLUGS.length) {
    console.warn(`  ⚠ expected ${APP_SLUGS.length} apps, found ${apps.length} (${apps.map((a) => a.slug).join(", ")}). Run seed-oauth.ts if quikchat is missing.`);
  }
  const allEmails = [ASHWIN_EMAIL, ...NEW_USERS.map((u) => u.email)];
  for (const email of allEmails) {
    for (const app of apps) {
      const isAdmin = email === ASHWIN_EMAIL || email === "dhwani@moreyeahs.com";
      await db.userAppAccess.upsert({
        where: { userId_orgId_appId: { userId: userIds[email]!, orgId: org.id, appId: app.id } },
        update: { role: isAdmin ? "admin" : "member" },
        create: { userId: userIds[email]!, orgId: org.id, appId: app.id, role: isAdmin ? "admin" : "member" },
      });
    }
  }
  console.log(`  ✓ granted ${apps.length} app(s) to ${allEmails.length} user(s)`);

  console.log("\n🎉 Done. Login credentials:");
  console.log(`   ${ASHWIN_EMAIL.padEnd(26)} (your existing password)`);
  for (const u of NEW_USERS) {
    console.log(`   ${u.email.padEnd(26)} password: ${PASSWORD}   ${u.role}`);
  }
}

main()
  .catch((e) => { console.error("\n❌ Seed failed:", e); process.exit(1); })
  .finally(async () => { await db.$disconnect(); });
