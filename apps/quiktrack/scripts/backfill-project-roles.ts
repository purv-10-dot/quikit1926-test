/**
 * One-shot backfill for projects created before the role grants were expanded
 * to cover the full project shell + field-level locks.
 *
 * Run:
 *   cd apps/quiktrack && npx tsx scripts/backfill-project-roles.ts
 *
 * Idempotent — every insert uses skipDuplicates / unique upsert semantics, so
 * re-running is safe.
 */
import { db } from "@/lib/db";
import { allPermissionPairs } from "@/lib/api/permissionsRegistry";
import {
  STARTER_PROJECT_ROLES,
  STARTER_FIELD_PERMS,
} from "@/lib/services/projectDefaults";

async function main() {
  const adminAllPairs = allPermissionPairs();
  const projects = await db.qtProject.findMany({
    where: { isDeleted: false },
    select: { id: true, name: true, orgId: true },
  });
  console.log(`Backfilling ${projects.length} project(s)…`);

  for (const project of projects) {
    for (const tmpl of STARTER_PROJECT_ROLES) {
      let role = await db.qtProjectRole.findUnique({
        where: { projectId_name: { projectId: project.id, name: tmpl.name } },
        select: { id: true },
      });
      if (!role) {
        // Project was created before seedProjectDefaults — create the role
        // now so admins can pick it from the Add Project Member drawer.
        role = await db.qtProjectRole.create({
          data: {
            orgId: project.orgId,
            projectId: project.id,
            name: tmpl.name,
            description: tmpl.description,
            isDefault: tmpl.isDefault,
          },
          select: { id: true },
        });
        console.log(`    + created role ${tmpl.name}`);
      }

      const grants = tmpl.name === "Space Admin" ? adminAllPairs : tmpl.grants;
      if (grants.length > 0) {
        await db.qtProjectRolePermission.createMany({
          data: grants.map((g) => ({
            projectRoleId: role.id,
            resource: g.resource,
            action: g.action,
          })),
          skipDuplicates: true,
        });
      }

      const fieldRows = STARTER_FIELD_PERMS[tmpl.name] ?? [];
      if (fieldRows.length > 0) {
        await db.qtProjectRoleFieldPermission.createMany({
          data: fieldRows.map((r) => ({
            projectRoleId: role.id,
            entity: r.entity,
            field: r.field,
            level: r.level,
          })),
          skipDuplicates: true,
        });
      }
    }
    console.log(`  ✓ ${project.name}`);
  }
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
