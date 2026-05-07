/**
 * Admin password-reset — force-set a known password for a users row.
 *
 * Usage (from apps/quikconstruction):
 *   node scripts/reset-user-password.mjs <email> [newPassword]
 *
 * If `newPassword` is omitted, a random 10-char temp password is
 * generated. The upsert also creates the row if it doesn't exist, so
 * this is safe to run after a rogue delete wiped the user from the DB.
 *
 * Why this exists: the invite email flow depends on SMTP reaching the
 * recipient's inbox. Until DNS (SPF/DKIM/DMARC) is fixed on quikit.ai,
 * Gmail routes the invites to spam and the recipient can't discover
 * their temp password. This script is the "I am the admin, set it for
 * me" escape hatch.
 */

import { PrismaClient } from "../node_modules/.prisma-qc/client/index.js";
import { randomBytes, scryptSync } from "crypto";

const email = process.argv[2]?.trim().toLowerCase();
if (!email) {
  console.error("Usage: node scripts/reset-user-password.mjs <email> [newPassword]");
  process.exit(2);
}

function generateTempPassword() {
  const alphabet = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = randomBytes(10);
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

function hashPassword(plain) {
  const salt = randomBytes(16).toString("hex");
  const h = scryptSync(plain, salt, 64).toString("hex");
  return `${salt}:${h}`;
}

const plain = process.argv[3] ?? generateTempPassword();
const passwordHash = hashPassword(plain);

const prisma = new PrismaClient();

try {
  const existing = await prisma.cnUser.findFirst({
    where: { email },
  });

  if (existing) {
    const updated = await prisma.cnUser.update({
      where: { id: existing.id },
      data: {
        passwordHash,
        status: "active",
        mustChangePassword: true,
        updatedAt: new Date(),
      },
    });
    console.log("\n✅ Password RESET for existing user");
    console.log("   id:        ", updated.id);
    console.log("   email:     ", updated.email);
    console.log("   userType:  ", updated.userType);
    console.log("   roleKey:   ", updated.roleKey);
    console.log("   status:    ", updated.status);
  } else {
    const created = await prisma.cnUser.create({
      data: {
        tenantId: "default",
        orgId: "default",
        email,
        username: email.split("@")[0],
        fullName: email.split("@")[0],
        department: null,
        userType: "ADMIN",
        roleKey: "tenant_admin",
        passwordHash,
        modulesAssigned: [],
        projectsAssigned: [],
        status: "active",
        mustChangePassword: true,
        inviteToken: null,
        inviteTokenExpires: null,
        invitedAt: new Date(),
        invitedBy: "cli-reset",
        invitedByName: "CLI Reset Script",
      },
    });
    console.log("\n✅ User CREATED (no prior row existed)");
    console.log("   id:        ", created.id);
    console.log("   email:     ", created.email);
    console.log("   userType:  ", created.userType, "(defaulted to ADMIN — change via UI if needed)");
    console.log("   roleKey:   ", created.roleKey);
  }

  console.log("\n──────────────────────────────────────");
  console.log(" LOGIN CREDENTIALS");
  console.log("──────────────────────────────────────");
  console.log("   URL:      http://localhost:3010/login?email=" + encodeURIComponent(email));
  console.log("   Email:    " + email);
  console.log("   Password: " + plain);
  console.log("──────────────────────────────────────\n");
  process.exit(0);
} catch (err) {
  console.error("\n❌ FAILED:", err?.code, err?.message);
  process.exit(1);
} finally {
  await prisma.$disconnect();
}
