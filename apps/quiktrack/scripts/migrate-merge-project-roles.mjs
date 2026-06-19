// ONE-SHOT MIGRATION - merge legacy 5 starter project roles into 3.
//   Project Admin + PM -> Space Admin ; Developer + QA -> Contributor ; Viewer unchanged
// Dry-run by default; --commit to apply. LOCAL: uses .env.local.
// PROD: DATABASE_URL='<neon>' node scripts/migrate-merge-project-roles.mjs [--commit]
import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
config({ path: ".env.local" });
config();
function describeTarget() {
  const raw = process.env.DATABASE_URL ?? "";
  try { const u = new URL(raw); return `${u.host}${u.pathname}`; }
  catch { return raw ? "(unparseable DATABASE_URL)" : "(DATABASE_URL not set)"; }
}
const db = new PrismaClient();
const COMMIT = process.argv.includes("--commit");
const TARGETS = [
  { name: "Space Admin", sources: ["Project Admin", "PM"], isDefault: false },
  { name: "Contributor", sources: ["Developer", "QA"], isDefault: true },
  { name: "Viewer", sources: ["Viewer"], isDefault: false },
];
const ROLE_MERGE = { "Project Admin": "Space Admin", PM: "Space Admin", Developer: "Contributor", QA: "Contributor" };
const LEGACY_NAMES = Object.keys(ROLE_MERGE);
async function copyGrants(fromId, toId) {
  const perms = await db.qtProjectRolePermission.findMany({ where: { projectRoleId: fromId }, select: { resource: true, action: true } });
  if (perms.length) await db.qtProjectRolePermission.createMany({ data: perms.map(p => ({ projectRoleId: toId, resource: p.resource, action: p.action })), skipDuplicates: true });
  const fields = await db.qtProjectRoleFieldPermission.findMany({ where: { projectRoleId: fromId }, select: { entity: true, field: true, level: true } });
  if (fields.length) await db.qtProjectRoleFieldPermission.createMany({ data: fields.map(f => ({ projectRoleId: toId, entity: f.entity, field: f.field, level: f.level })), skipDuplicates: true });
}
async function ensureTargets(projectId, orgId, idByName) {
  for (const t of TARGETS) {
    if (idByName.has(t.name)) continue;
    const sourceName = t.sources.find(s => idByName.get(s));
    const sourceId = sourceName ? idByName.get(sourceName) : null;
    if (!COMMIT) { console.log(`    [dry] would create role "${t.name}"` + (sourceId ? ` (copy grants from "${sourceName}")` : " (no source - empty)")); continue; }
    const created = await db.qtProjectRole.create({ data: { orgId, projectId, name: t.name, isDefault: t.isDefault }, select: { id: true } });
    idByName.set(t.name, created.id);
    if (sourceId) await copyGrants(sourceId, created.id);
    console.log(`    + created role "${t.name}"` + (sourceId ? " (grants copied)" : " (empty)"));
  }
}
async function main() {
  console.log(`Target DB: ${describeTarget()}`);
  console.log(COMMIT ? "[COMMIT] changes WILL be written.\n" : "[DRY RUN] nothing written. Re-run with --commit to apply.\n");
  const projects = await db.qtProject.findMany({ where: { isDeleted: false }, select: { id: true, name: true, orgId: true } });
  console.log(`Scanning ${projects.length} project(s)...\n`);
  let remapped = 0, rolesDeleted = 0; const unmapped = [];
  for (const project of projects) {
    const roles = await db.qtProjectRole.findMany({ where: { projectId: project.id }, select: { id: true, name: true } });
    const idByName = new Map(roles.map(r => [r.name, r.id]));
    await ensureTargets(project.id, project.orgId, idByName);
    for (const legacyName of LEGACY_NAMES) {
      const legacyId = idByName.get(legacyName); if (!legacyId) continue;
      const targetId = idByName.get(ROLE_MERGE[legacyName]);
      const assignments = await db.qtProjectUserRole.findMany({ where: { projectId: project.id, projectRoleId: legacyId }, select: { id: true, userId: true } });
      for (const a of assignments) {
        if (COMMIT) await db.qtProjectUserRole.update({ where: { id: a.id }, data: { projectRoleId: targetId } });
        remapped++;
      }
    }
    for (const legacyName of LEGACY_NAMES) {
      const legacyId = idByName.get(legacyName); if (!legacyId) continue;
      if (COMMIT) await db.qtProjectRole.delete({ where: { id: legacyId } });
      rolesDeleted++;
    }
    const standard = new Set(["Space Admin", "Contributor", "Viewer", ...LEGACY_NAMES]);
    for (const r of roles) if (!standard.has(r.name)) unmapped.push({ project: project.name, role: r.name });
  }
  console.log("---------- summary ----------");
  console.log(`assignments ${COMMIT ? "remapped" : "to remap"} : ${remapped}`);
  console.log(`legacy roles ${COMMIT ? "deleted" : "to delete"} : ${rolesDeleted}`);
  if (unmapped.length) { console.log(`\n${unmapped.length} custom/renamed role(s) left untouched:`); for (const u of unmapped) console.log(`  - [${u.project}] "${u.role}"`); }
  console.log(COMMIT ? "\nDone (committed)." : "\nDry run complete - nothing written.");
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => db.$disconnect());
