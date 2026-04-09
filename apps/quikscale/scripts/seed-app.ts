/**
 * Seed script: Creates the "QuikScale" app and grants access
 * to all existing active memberships.
 *
 * Run: npx tsx scripts/seed-app.ts
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();

async function main() {
  // 1. Upsert QuikScale app
  const app = await db.app.upsert({
    where: { slug: "quikscale" },
    update: {
      name: "QuikScale",
      description: "Scaling Up execution platform — KPIs, Priorities, OPSP, Meeting Rhythm & more",
      baseUrl: "/",
      status: "active",
    },
    create: {
      name: "QuikScale",
      slug: "quikscale",
      description: "Scaling Up execution platform — KPIs, Priorities, OPSP, Meeting Rhythm & more",
      baseUrl: "/",
      status: "active",
    },
  });

  console.log(`App upserted: ${app.name} (${app.id})`);

  // 2. Grant access to all active memberships
  const memberships = await db.membership.findMany({
    where: { status: "active" },
  });

  let created = 0;
  for (const m of memberships) {
    await db.userAppAccess.upsert({
      where: {
        userId_tenantId_appId: {
          userId: m.userId,
          tenantId: m.tenantId,
          appId: app.id,
        },
      },
      update: {},
      create: {
        userId: m.userId,
        tenantId: m.tenantId,
        appId: app.id,
        role: m.role === "admin" ? "admin" : "member",
      },
    });
    created++;
  }

  console.log(`Granted QuikScale access to ${created} memberships`);
}

main()
  .catch(console.error)
  .finally(() => db.$disconnect());
