/**
 * Seeds demo org + users + active memberships for standalone credentials auth.
 *
 *   npm run seed:demo
 *
 * Requires DATABASE_URL (and DATABASE_URL_DIRECT if your Prisma schema uses it).
 */
import { config } from "dotenv";

config({ path: ".env.local" });
config();

const DEMO_PASSWORD = "admin123";
const ORG_SLUG = "quikcrm-demo";

const SEEDED_USERS: readonly { email: string; firstName: string; lastName: string }[] = [
  { email: "admin@quikcrm.com", firstName: "Admin", lastName: "User" },
  { email: "adarsh.jain@quikit.ai", firstName: "Adarsh", lastName: "Jain" },
  { email: "rishab.dedora@moreyeahsa.com", firstName: "Rishab", lastName: "Dedora" },
  { email: "alok.emossy@emossy.com", firstName: "Alok", lastName: "Emossy" },
  { email: "crmexpress@example.com", firstName: "CrmExpress", lastName: "User" },
];

async function main() {
  const { db } = await import("../lib/db");
  const { hashPassword } = await import("../lib/auth/bcrypt");
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const org = await db.org.upsert({
    where: { slug: ORG_SLUG },
    create: {
      name: "QuikCRM Demo Org",
      slug: ORG_SLUG,
    },
    update: { name: "QuikCRM Demo Org" },
  });

  for (const { email, firstName, lastName } of SEEDED_USERS) {
    const user = await db.user.upsert({
      where: { email },
      create: {
        email,
        firstName,
        lastName,
        password: passwordHash,
      },
      update: {
        password: passwordHash,
        firstName,
        lastName,
      },
    });

    await db.orgMember.upsert({
      where: {
        orgId_userId: {
          orgId: org.id,
          userId: user.id,
        },
      },
      create: {
        orgId: org.id,
        userId: user.id,
        role: "admin",
        status: "active",
      },
      update: {
        role: "admin",
        status: "active",
      },
    });

    console.log(`Seeded: ${email} (password: ${DEMO_PASSWORD}) → org ${ORG_SLUG}`);
  }

  console.log(`[seed:demo] Done. ${SEEDED_USERS.length} user(s).`);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
