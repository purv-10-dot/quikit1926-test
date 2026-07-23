/**
 * One-off cleanup for the role-reversion bug's bad data.
 *
 * The dashboard layout used to re-add the default "Member" role on every load
 * for non-admin-tier platform users, regardless of the QuikAsset role a manager
 * had explicitly assigned. That left two artifacts:
 *   1. Some users held TWO QuikAsset roles — their real role (e.g. "Asset
 *      Manager") plus a spurious "Member".
 *   2. The central `UserAppAccess.role` mirror (what the Admin Portal shows) got
 *      flipped to "Member" for those same users.
 *
 * The code fix (ensureDefaultRoleIfNone) stops new artifacts; this cleans both:
 *   Pass 1 — delete the spurious "Member" role row for any user who also holds a
 *            non-Member QuikAsset role in the same org (Member-only users are
 *            left alone — that's a legitimate default).
 *   Pass 2 — re-sync the central mirror: where it's stuck on "Member" but the
 *            user's actual (remaining) role is something else, set it to that
 *            role. This also repairs users whose duplicate was already removed
 *            but whose mirror was left inconsistent.
 *
 * Run (from apps/quikasset, DATABASE_URL[_DIRECT] in env):
 *   npx tsx scripts/cleanup-duplicate-member-roles.ts            # dry-run
 *   npx tsx scripts/cleanup-duplicate-member-roles.ts --apply    # perform
 *
 * Idempotent — safe to re-run.
 */
import { PrismaClient } from "@prisma/client";
import { mirrorAppRoleToCentral } from "@quikit/auth/assign-app-roles";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

async function main() {
  const app = await db.app.findUnique({ where: { slug: "quikasset" }, select: { id: true } });
  if (!app) {
    console.error('QuikAsset app not registered (slug "quikasset"). Nothing to do.');
    return;
  }

  const rows = await db.astUserAppRole.findMany({
    where: { role: { appId: app.id } },
    select: { id: true, userId: true, orgId: true, role: { select: { name: true } } },
  });

  // Group role rows per (orgId, userId).
  const byUser = new Map<string, { id: string; name: string }[]>();
  for (const r of rows) {
    const key = `${r.orgId}|${r.userId}`;
    if (!byUser.has(key)) byUser.set(key, []);
    byUser.get(key)!.push({ id: r.id, name: r.role.name });
  }

  // ── Pass 1: spurious duplicate Member rows ──
  const memberRowIdsToDelete: string[] = [];
  for (const [key, list] of byUser) {
    const nonMember = list.filter((r) => r.name !== "Member");
    const memberRows = list.filter((r) => r.name === "Member");
    if (nonMember.length > 0 && memberRows.length > 0) {
      const keptNames = [...new Set(nonMember.map((r) => r.name))];
      console.log(`  role: ${key.split("|")[1]} — drop spurious Member (keeping [${keptNames.join(", ")}])`);
      memberRowIdsToDelete.push(...memberRows.map((r) => r.id));
    }
  }
  console.log(
    `\n${APPLY ? "APPLY" : "DRY-RUN"} — ${memberRowIdsToDelete.length} spurious Member role row(s) across ` +
      `${byUser.size} role-holder(s).`,
  );
  if (APPLY && memberRowIdsToDelete.length > 0) {
    const res = await db.astUserAppRole.deleteMany({ where: { id: { in: memberRowIdsToDelete } } });
    console.log(`Deleted ${res.count} row(s).`);
  }

  // ── Pass 2: central mirror re-sync (repairs "Member"-stuck mirrors) ──
  // Surviving role per user AFTER the pass-1 deletion (prefer a non-Member role).
  const deletedIds = new Set(memberRowIdsToDelete);
  const survivingByKey = new Map<string, string>();
  for (const [key, list] of byUser) {
    const survivors = list.filter((r) => !deletedIds.has(r.id));
    if (survivors.length === 0) continue;
    const nonMember = survivors.find((r) => r.name !== "Member");
    survivingByKey.set(key, (nonMember ?? survivors[0]).name);
  }

  const accesses = await db.userAppAccess.findMany({
    where: { appId: app.id },
    select: { orgId: true, userId: true, role: true },
  });
  const staleMirrors: { orgId: string; userId: string; from: string; to: string }[] = [];
  for (const acc of accesses) {
    const target = survivingByKey.get(`${acc.orgId}|${acc.userId}`);
    // Only the reversion artifact: mirror reads "Member" but the real role isn't.
    if (target && target !== "Member" && acc.role === "Member") {
      staleMirrors.push({ orgId: acc.orgId, userId: acc.userId, from: acc.role, to: target });
    }
  }
  console.log(`\nCentral mirror stuck on "Member" while the real role differs: ${staleMirrors.length} user(s).`);
  for (const m of staleMirrors.slice(0, 12)) console.log(`  mirror: ${m.userId} — "${m.from}" -> "${m.to}"`);
  if (APPLY && staleMirrors.length > 0) {
    for (const m of staleMirrors) {
      await mirrorAppRoleToCentral(db, { orgId: m.orgId, userId: m.userId, appId: app.id, roleName: m.to });
    }
    console.log(`Re-synced ${staleMirrors.length} central mirror row(s).`);
  }

  if (!APPLY) console.log("\nRe-run with --apply to perform the cleanup.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
