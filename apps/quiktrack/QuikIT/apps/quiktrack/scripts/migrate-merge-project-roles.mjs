// ONE-SHOT MIGRATION — merge the legacy 5 starter project roles into 3.
//
//     Project Admin + PM  →  Space Admin
//     Developer + QA       →  Contributor
//     Viewer               →  Viewer   (unchanged)
//
// Plain .mjs run with `node` (the repo's root-script pattern — apps/quiktrack
// tsx can't resolve standalone scripts cleanly). New roles inherit their
// grants + field-perms by COPYING from the legacy source role in the SAME
// project, so each space keeps the grant set it actually had:
//
//     Space Admin  ← copies from "Project Admin" (falls back to "PM")
//     Contributor  ← copies from "Developer"      (falls back to "QA")
//     Viewer       ← already present in every space; created empty if missing
//
// Per non-deleted project:
//   1. Ensure the 3 target roles exist (create + copy grants from the legacy
//      source role). Idempotent — skips a target that already exists.
//   2. Reassign every QtProjectUserRole on a legacy role to its target. The
//      table is unique on (projectId, userId), so each user holds exactly one
//      project role — the remap is a plain FK UPDATE with no duplicate risk.
//      Must run BEFORE step 3, or the cascade there deletes the assignments.
//   3. Delete the 4 legacy roles. onDelete: Cascade on QtProjectRole removes
//      their permissions / field-perms / navigations / leftover user-role rows.
//
// LIMITATION (per the "migrate + remap, overwrite customizations" decision):
// roles are matched by their original seeded NAME. A role an admin RENAMED
// away from a legacy name cannot be auto-mapped — it is left untouched and
// logged under "unmapped roles" for manual review. Custom roles admins ADDED
// are likewise never deleted.
//
// DESTRUCTIVE: step 3 deletes role rows. Dry-run by default — it reports what
// it WOULD do and writes nothing. Pass `--commit` to apply.
//
// LOCAL (uses .env.local):
//   cd apps/quiktrack && node scripts/migrate-merge-project-roles.mjs            # dry run
//   cd apps/quiktrack && node scripts/migrate-merge-project-roles.mjs --commit   # apply
//
// PROD (Neon) — pass the prod connection string inline. An explicit DATABASE_URL
// is NEVER overridden by .env.local (dotenv only fills unset vars), so this wins:
//   DATABASE_URL='postgresql://…neon…' node scripts/migrate-merge-project-roles.mjs            # dry run
//   DATABASE_URL='postgresql://…neon…' node scripts/migrate-merge-project-roles.mjs --commit   # apply
//
// On startup the script prints the host:db it is about to touch — confirm it
// before approving a --commit. Migrations do NOT auto-run on deploy in this
// repo, so prod must be run manually and deliberately.

import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";

// Fill DATABASE_URL from .env.local / .env ONLY if not already set in the
// environment. An inline `DATABASE_URL=… node …` (prod) always takes priority.
config({ path: ".env.local" });
config();

// Surface which DB we're about to touch (host + db name only — never creds).
function describeTarget() {
  const raw = process.env.DATABASE_URL ?? "";
  try {
    const u = new URL(raw);
    return `${u.host}${u.pathname}`;
  } catch {
    return raw ? "(unparseable DATABASE_URL)" : "(DATABASE_URL not set)";
  }
}

const db = new PrismaClient();
const COMMIT = process.argv.includes("--commit");

// target role name → { from legacy source(s), isDefault on the new role }
const TARGETS = [
  { name: "Space Admin", sources: ["Project Admin", "PM"], isDefault: false },
  { name: "Contributor", sources: ["Developer", "QA"], isDefault: true },
  { name: "Viewer", sources: ["Viewer"], isDefault: false },
];

// legacy role name → target name (drives remap + deletion). "Viewer" is
// intentionally absent: it survives unchanged.
const ROLE_MERGE = {
  "Project Admin": "Space Admin",
  PM: "Space Admin",
  Developer: "Contributor",
  QA: "Contributor",
};
const LEGACY_NAMES = Object.keys(ROLE_MERGE);

async function copyGrants(fromRoleId, toRoleId) {
  const perms = await db.qtProjectRolePermission.findMany({
    where: { projectRoleId: fromRoleId },
    select: { resource: true, action: true },
  });
  if (perms.length) {
    await db.qtProjectRolePermission.createMany({
      data: perms.map((p) => ({ projectRoleId: toRoleId, resource: p.resource, action: p.action })),
      skipDuplicates: true,
    });
  }
  const fields = await db.qtProjectRoleFieldPermission.findMany({
    where: { projectRoleId: fromRoleId },
    select: { entity: true, field: true, level: true },
  });
  if (fields.length) {
    await db.qtProjectRoleFieldPermission.createMany({
      data: fields.map((f) => ({
        projectRoleId: toRoleId,
        entity: f.entity,
        field: f.field,
        level: f.level,
      })),
      skipDuplicates: true,
    });
  }
}

async function ensureTargets(projectId, orgId, idByName) {
  for (const t of TARGETS) {
    if (idByName.has(t.name)) continue; // target already present
    // First legacy source role that exists in THIS project is the grant source.
    const sourceName = t.sources.find((s) => idByName.get(s));
    const sourceId = sourceName ? idByName.get(sourceName) : null;

    if (!COMMIT) {
      console.log(
        `    [dry] would create role "${t.name}"` +
          (sourceId ? ` (copy grants from "${sourceName}")` : " (no source — empty grants)"),
      );
      continue;
    }

    const created = await db.qtProjectRole.create({
      data: { orgId, projectId, name: t.name, isDefault: t.isDefault },
      select: { id: true },
    });
    idByName.set(t.name, created.id);
    if (sourceId) await copyGrants(sourceId, created.id);
    console.log(`    + created role "${t.name}"` + (sourceId ? " (grants copied)" : " (empty)"));
  }
}

async function main() {
  console.log(`Target DB: ${describeTarget()}`);
  console.log(
    COMMIT
      ? "⚠️  COMMIT mode — changes WILL be written.\n"
      : "🟢 DRY RUN — no changes written. Re-run with --commit to apply.\n",
  );

  const projects = await db.qtProject.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true, orgId: true },
  });
  console.log(`Scanning ${projects.length} project(s)…\n`);

  let remapped = 0;
  let rolesDeleted = 0;
  const unmapped = [];

  for (const project of projects) {
    console.log(`• ${project.name} (${project.id})`);

    const roles = await db.qtProjectRole.findMany({
      where: { projectId: project.id },
      select: { id: true, name: true },
    });
    const idByName = new Map(roles.map((r) => [r.name, r.id]));

    // 1. Make sure the 3 target roles exist before remapping into them.
    await ensureTargets(project.id, project.orgId, idByName);

    // 2. Remap user-role assignments off each legacy role onto its target.
    for (const legacyName of LEGACY_NAMES) {
      const legacyId = idByName.get(legacyName);
      if (!legacyId) continue; // this project never had / already lost it
      const targetId = idByName.get(ROLE_MERGE[legacyName]);
      const assignments = await db.qtProjectUserRole.findMany({
        where: { projectId: project.id, projectRoleId: legacyId },
        select: { id: true, userId: true },
      });
      for (const a of assignments) {
        if (!COMMIT) {
          console.log(`    [dry] would remap user ${a.userId}: ${legacyName} → ${ROLE_MERGE[legacyName]}`);
        } else {
          await db.qtProjectUserRole.update({
            where: { id: a.id },
            data: { projectRoleId: targetId },
          });
          console.log(`    ↳ remapped user ${a.userId}: ${legacyName} → ${ROLE_MERGE[legacyName]}`);
        }
        remapped++;
      }
    }

    // 3. Delete the legacy roles (cascade clears their grants/field-perms/
    //    navigations/any leftover assignment rows).
    for (const legacyName of LEGACY_NAMES) {
      const legacyId = idByName.get(legacyName);
      if (!legacyId) continue;
      if (!COMMIT) {
        console.log(`    [dry] would delete legacy role "${legacyName}"`);
      } else {
        await db.qtProjectRole.delete({ where: { id: legacyId } });
        console.log(`    ✗ deleted legacy role "${legacyName}"`);
      }
      rolesDeleted++;
    }

    // Flag any non-standard roles for manual review (renamed/custom).
    const standard = new Set(["Space Admin", "Contributor", "Viewer", ...LEGACY_NAMES]);
    for (const r of roles) {
      if (!standard.has(r.name)) unmapped.push({ project: project.name, role: r.name });
    }
  }

  console.log("\n──────────── summary ────────────");
  console.log(`assignments ${COMMIT ? "remapped" : "to remap"} : ${remapped}`);
  console.log(`legacy roles ${COMMIT ? "deleted" : "to delete"} : ${rolesDeleted}`);
  if (unmapped.length) {
    console.log(`\n⚠️  ${unmapped.length} custom/renamed role(s) left untouched — review manually:`);
    for (const u of unmapped) console.log(`     - [${u.project}] "${u.role}"`);
  }
  console.log(COMMIT ? "\n✅ Done (committed)." : "\n🟢 Dry run complete — nothing written.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
