/**
 * Enable QuikCRM for every org (and user) that already has QuikScale provisioned.
 * Idempotent — safe to re-run after seed-oauth.
 *
 * Run:
 *   DATABASE_URL='postgresql://...' npx tsx prisma/seed-enable-quikcrm.ts
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PrismaClient } from "@prisma/client";

function loadDatabaseUrlFromQuikitEnv(): void {
  if (process.env.DATABASE_URL) return;
  const repoRoot = join(__dirname, "../../..");
  for (const file of ["apps/quikit/.env.local", "apps/quikit/.env"]) {
    const path = join(repoRoot, file);
    if (!existsSync(path)) continue;
    const text = readFileSync(path, "utf8");
    for (const line of text.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("DATABASE_URL=")) continue;
      const raw = trimmed.slice("DATABASE_URL=".length).trim();
      process.env.DATABASE_URL = raw.replace(/^["']|["']$/g, "");
      return;
    }
  }
  throw new Error("[seed-enable-quikcrm] DATABASE_URL unset — set it or use apps/quikit/.env.local");
}

loadDatabaseUrlFromQuikitEnv();

const prisma = new PrismaClient();

async function main() {
  const [quikcrm, quikscale] = await Promise.all([
    prisma.app.findUnique({ where: { slug: "quikcrm" } }),
    prisma.app.findUnique({ where: { slug: "quikscale" } }),
  ]);

  if (!quikcrm) throw new Error("quikcrm app missing — run seed-oauth.ts first");
  if (!quikscale) throw new Error("quikscale app missing — run seed-oauth.ts first");

  const scaleAccess = await prisma.orgAppAccess.findMany({
    where: { appId: quikscale.id, enabled: true },
    select: { orgId: true },
  });

  if (scaleAccess.length === 0) {
    console.log("No orgs with QuikScale enabled — enable apps via super-admin first.");
    return;
  }

  console.log(`Provisioning QuikCRM for ${scaleAccess.length} org(s)…\n`);

  for (const { orgId } of scaleAccess) {
    await prisma.orgAppAccess.upsert({
      where: { orgId_appId: { orgId, appId: quikcrm.id } },
      update: { enabled: true },
      create: { orgId, appId: quikcrm.id, enabled: true },
    });

    const scaleUsers = await prisma.userAppAccess.findMany({
      where: { orgId, appId: quikscale.id },
      select: { userId: true, role: true },
    });

    for (const { userId, role } of scaleUsers) {
      await prisma.userAppAccess.upsert({
        where: { userId_orgId_appId: { userId, orgId, appId: quikcrm.id } },
        update: { role },
        create: { userId, orgId, appId: quikcrm.id, role },
      });
    }

    const org = await prisma.org.findUnique({ where: { id: orgId }, select: { slug: true } });
    console.log(`  ✅ ${org?.slug ?? orgId} — org + ${scaleUsers.length} user(s)`);
  }

  console.log("\n🎉 QuikCRM visible in launcher for matching orgs/users.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
