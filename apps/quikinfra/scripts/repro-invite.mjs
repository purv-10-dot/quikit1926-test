// Repro the POST /api/settings/users flow end-to-end.
import { PrismaClient } from "../node_modules/.prisma-qc/client/index.js";
import { randomBytes, scryptSync } from "crypto";
import nodemailer from "nodemailer";
import * as fs from "fs";

// Parse .env
const env = {};
for (const line of fs.readFileSync(".env", "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)\s*$/);
  if (!m || line.startsWith("#")) continue;
  let v = m[2];
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1,-1);
  env[m[1]] = v;
}

const testEmail = process.argv[2] ?? "repro-test@example.local";

const prisma = new PrismaClient();

// Clean up any previous test row
try { await prisma.cnUser.delete({ where: { tenantId_email: { tenantId: "default", email: testEmail } } }); } catch {}

// hashPassword clone
function hashPassword(p) {
  const salt = randomBytes(16).toString("hex");
  const h = scryptSync(p, salt, 64).toString("hex");
  return `${salt}:${h}`;
}

const tempPassword = "TestPass123";
const passwordHash = hashPassword(tempPassword);

console.log("[1/3] creating user via prisma...");
try {
  const row = await prisma.cnUser.create({
    data: {
      tenantId: "default",
      orgId: "default",
      email: testEmail,
      username: "reprotest",
      fullName: "Repro Test",
      department: null,
      userType: "SITE_ADMIN",
      roleKey: "site_admin",
      passwordHash,
      modulesAssigned: [],
      projectsAssigned: [],
      status: "active",
      mustChangePassword: true,
      inviteToken: "repro-token",
      inviteTokenExpires: new Date(Date.now() + 86400000),
      invitedAt: new Date(),
      invitedBy: "demo-user-1",
      invitedByName: "Repro Script",
    },
  });
  console.log("  ✓ created id=", row.id);
} catch (e) {
  console.error("  ✗ FAILED:", e?.code, e?.message);
  process.exit(1);
}

console.log("[2/3] building nodemailer transport...");
const transport = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: parseInt(env.SMTP_PORT ?? "587", 10),
  secure: (env.SMTP_SECURE ?? "false").toLowerCase() === "true",
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  requireTLS: (env.SMTP_SECURE ?? "false").toLowerCase() !== "true",
  tls: { minVersion: "TLSv1.2" },
});

console.log("[3/3] verifying SMTP + sending test mail...");
try {
  await transport.verify();
  console.log("  ✓ SMTP verify OK");
  const info = await transport.sendMail({
    from: env.MAIL_FROM ?? env.SMTP_USER,
    to: testEmail,
    subject: "[repro] POST /api/settings/users flow test",
    text: `Temp password: ${tempPassword}`,
  });
  console.log("  ✓ SENT — accepted:", info.accepted, "rejected:", info.rejected);
} catch (e) {
  console.error("  ✗ SMTP FAILED:", e?.code, e?.response ?? e?.message);
  await prisma.$disconnect();
  process.exit(1);
}

await prisma.$disconnect();
console.log("\n[repro] ✅ both steps succeeded — createUser + sendMail work");
