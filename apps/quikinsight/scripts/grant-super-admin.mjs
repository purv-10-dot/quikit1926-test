// Grant SUPER_ADMIN to a user (org-wide, no team).
//
//   node scripts/grant-super-admin.mjs [email]
//
// Defaults to zenul.khan@moreyeahs.com. Creates the user if they haven't signed
// in yet, then replaces their role assignments with a single org-wide SUPER_ADMIN
// grant. Idempotent — safe to re-run.
import fs from "node:fs";
import path from "node:path";
import { PrismaClient } from "@prisma/client";

// Prefer the IPv4 session pooler (DIRECT_URL) for one-off scripts — the direct
// db.<ref> host is IPv6-only and the transaction pooler rejects some statements.
function readEnv(key) {
  const p = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(p)) return undefined;
  const m = fs.readFileSync(p, "utf8").match(new RegExp(`^${key}=(.*)$`, "m"));
  return m ? m[1].trim().replace(/^["']|["']$/g, "") : undefined;
}

const email = (process.argv[2] ?? "sadullah.khan@moreyeahs.com").toLowerCase();
if (!email.endsWith("@moreyeahs.com")) {
  console.error(`Refusing: ${email} is not a @moreyeahs.com address.`);
  process.exit(1);
}

const url = process.env.DATABASE_URL_DIRECT ?? readEnv("DATABASE_URL_DIRECT") ?? readEnv("DATABASE_URL");
const prisma = new PrismaClient({ datasources: { db: { url } } });

try {
  const user = await prisma.user.upsert({
    where:  { email },
    update: {},
    create: { email, updatedAt: new Date() },
    select: { id: true, email: true },
  });

  await prisma.$transaction([
    prisma.userRole.deleteMany({ where: { userId: user.id } }),
    prisma.userRole.create({ data: { userId: user.id, role: "SUPER_ADMIN", teamId: null } }),
  ]);

  console.log(`✓ Granted SUPER_ADMIN (org-wide) to ${user.email}`);
} catch (e) {
  console.error("✗ Failed:", e.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
