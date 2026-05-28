/**
 * One-off migration — copy `users` from the JSON demo-store snapshot
 * into the Postgres `cn_users` table so existing invited accounts keep
 * working after the storage switch.
 *
 * Usage (from apps/quikinfra):
 *   node scripts/migrate-users-to-db.mjs
 *
 * Idempotent: existing rows (matched by tenantId + email) are skipped,
 * not overwritten, so you can run it repeatedly. Requires the
 * `cn_users` table to exist — run `npx prisma migrate dev --name
 * add_cn_users` first.
 */

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { PrismaClient } from "../node_modules/.prisma-qc/client/index.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storePath = path.resolve(
  __dirname,
  "..",
  ".data",
  "quikinfra-store.json"
);

if (!fs.existsSync(storePath)) {
  console.error(`[migrate-users] no snapshot at ${storePath}`);
  process.exit(0);
}

const snapshot = JSON.parse(fs.readFileSync(storePath, "utf8"));
// The demo-store persistence format nests every array under `collections`
// (e.g. snapshot.collections.users). Fall back to a root-level `users`
// key for older snapshots.
const rawUsers = Array.isArray(snapshot?.collections?.users)
  ? snapshot.collections.users
  : Array.isArray(snapshot?.users)
  ? snapshot.users
  : [];

if (rawUsers.length === 0) {
  console.log("[migrate-users] snapshot has no users — nothing to migrate");
  process.exit(0);
}

// Only migrate users with a real password hash — rows seeded for demo
// purposes have no hash and can't log in anyway. The real invited
// users (the ones we actually care about) have a hash.
const hashed = rawUsers.filter((u) => u?.passwordHash);

// Dedupe by (tenantId, email) since the old JSON storage allowed the
// same email to be written multiple times with different roles. Keep
// the most recent entry so the latest-assigned role wins.
const dedupedByKey = new Map();
for (const u of hashed) {
  const key = `${u.tenantId ?? "default"}::${String(u.email ?? "").toLowerCase()}`;
  const existing = dedupedByKey.get(key);
  if (!existing || (u.updatedAt ?? "") >= (existing.updatedAt ?? "")) {
    dedupedByKey.set(key, u);
  }
}
const users = Array.from(dedupedByKey.values());

console.log(
  `[migrate-users] found ${rawUsers.length} in snapshot, ` +
    `${hashed.length} with passwordHash, ` +
    `${users.length} after dedup`
);

const prisma = new PrismaClient();
let created = 0;
let skipped = 0;
let errored = 0;

for (const u of users) {
  if (!u.email || !u.passwordHash) {
    console.warn(
      `[migrate-users] skip (no email/hash): ${u.fullName ?? u.id ?? "?"}`
    );
    skipped++;
    continue;
  }
  const email = String(u.email).toLowerCase();
  const tenantId = u.tenantId ?? "default";
  try {
    const existing = await prisma.cnUser.findUnique({
      where: { tenantId_email: { tenantId, email } },
    });
    if (existing) {
      console.log(`[migrate-users] exists, skip: ${email}`);
      skipped++;
      continue;
    }
    await prisma.cnUser.create({
      data: {
        tenantId,
        orgId: u.orgId ?? "default",
        email,
        username: u.username ?? email.split("@")[0],
        fullName: u.fullName ?? email,
        department: u.department ?? null,
        userType: u.userType ?? "USER",
        roleKey: u.roleKey ?? "user",
        passwordHash: u.passwordHash,
        modulesAssigned: Array.isArray(u.modulesAssigned) ? u.modulesAssigned : [],
        projectsAssigned: Array.isArray(u.projectsAssigned) ? u.projectsAssigned : [],
        status: u.status === "inactive" ? "inactive" : "active",
        mustChangePassword: !!u.mustChangePassword,
        inviteToken: u.inviteToken ?? null,
        inviteTokenExpires: u.inviteTokenExpires ? new Date(u.inviteTokenExpires) : null,
        invitedAt: u.invitedAt ? new Date(u.invitedAt) : new Date(),
        invitedByName: u.invitedByName ?? null,
        acceptedAt: u.acceptedAt ? new Date(u.acceptedAt) : null,
      },
    });
    console.log(`[migrate-users] created: ${email}`);
    created++;
  } catch (err) {
    console.error(`[migrate-users] failed for ${email}:`, err?.message ?? err);
    errored++;
  }
}

await prisma.$disconnect();
console.log(
  `\n[migrate-users] done — created=${created} skipped=${skipped} errored=${errored}`
);
process.exit(errored > 0 ? 1 : 0);
