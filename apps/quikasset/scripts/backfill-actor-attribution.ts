/**
 * One-time backfill for the actor-attribution columns
 * (AstAsset.createdByUserId, AstAssignment.assignedByUserId, AstRepair.createdByUserId).
 *
 * Existing rows created before the columns landed have NULL actors, but the
 * actor was recorded at creation time in AstAuditLog (entityId = the record's id,
 * actorId = platform User.id). This script rebuilds each record's actor from its
 * create-action audit row. Record ids are globally-unique cuids, so entityId maps
 * 1:1 to a record; the AstAuditLog `[orgId, module]` index keeps the reads cheap.
 *
 * Only fills rows where the column is still NULL — never overwrites a value set
 * by the live handlers.
 *
 * LIMITATION: bulk create/assign audited only the FIRST row of each batch
 * (entityId = created[0].id), so the 2nd..Nth rows of an old bulk batch have no
 * matching audit row and stay NULL. New rows (post-change) are unaffected. The
 * summary reports how many rows were left unattributed.
 *
 * Run (from apps/quikasset, with DATABASE_URL[_DIRECT] in env — for the demo,
 * point it at Neon):
 *   npx tsx scripts/backfill-actor-attribution.ts            # dry-run
 *   npx tsx scripts/backfill-actor-attribution.ts --apply    # perform
 *
 * Idempotent — safe to re-run.
 */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const APPLY = process.argv.includes("--apply");

type Spec = {
  label: string;
  module: string;
  actions: string[];
  /** Count rows still missing an actor. */
  countMissing: () => Promise<number>;
  /** Count still-NULL rows that DO have a matching audit actor (dry-run report). */
  countFillable: (byEntity: Map<string, string>) => Promise<number>;
  /** For the given entityId→actorId map, set the column where still NULL. Returns rows updated. */
  apply: (byEntity: Map<string, string>) => Promise<number>;
};

/** Build entityId → actorId from the create-action audit rows for a module. */
async function actorByEntity(module: string, actions: string[]): Promise<Map<string, string>> {
  const rows = await db.astAuditLog.findMany({
    where: { module, action: { in: actions }, actorId: { not: null } },
    select: { entityId: true, actorId: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  const map = new Map<string, string>();
  for (const r of rows) {
    // First create row wins (a record is only "created" once).
    if (r.actorId && !map.has(r.entityId)) map.set(r.entityId, r.actorId);
  }
  return map;
}

/** Group ids by actor and updateMany per actor, only touching still-NULL rows. */
async function fillColumn(
  ids: string[],
  byEntity: Map<string, string>,
  update: (idsForActor: string[], actorId: string) => Promise<number>,
): Promise<number> {
  const byActor = new Map<string, string[]>();
  for (const id of ids) {
    const actor = byEntity.get(id);
    if (!actor) continue;
    (byActor.get(actor) ?? byActor.set(actor, []).get(actor)!).push(id);
  }
  let updated = 0;
  for (const [actorId, idsForActor] of byActor) {
    updated += await update(idsForActor, actorId);
  }
  return updated;
}

const SPECS: Spec[] = [
  {
    label: "assets.createdByUserId",
    module: "Assets",
    actions: ["Asset Created", "Assets Bulk Created"],
    countMissing: () => db.astAsset.count({ where: { createdByUserId: null } }),
    countFillable: (byEntity) =>
      db.astAsset.count({ where: { createdByUserId: null, id: { in: [...byEntity.keys()] } } }),
    apply: async (byEntity) => {
      const rows = await db.astAsset.findMany({
        where: { createdByUserId: null, id: { in: [...byEntity.keys()] } },
        select: { id: true },
      });
      return fillColumn(rows.map((r) => r.id), byEntity, (ids, actorId) =>
        db.astAsset
          .updateMany({ where: { id: { in: ids }, createdByUserId: null }, data: { createdByUserId: actorId } })
          .then((r) => r.count),
      );
    },
  },
  {
    label: "assignments.assignedByUserId",
    module: "Assignments",
    actions: ["Asset Assigned", "Assets Bulk Assigned"],
    countMissing: () => db.astAssignment.count({ where: { assignedByUserId: null } }),
    countFillable: (byEntity) =>
      db.astAssignment.count({ where: { assignedByUserId: null, id: { in: [...byEntity.keys()] } } }),
    apply: async (byEntity) => {
      const rows = await db.astAssignment.findMany({
        where: { assignedByUserId: null, id: { in: [...byEntity.keys()] } },
        select: { id: true },
      });
      return fillColumn(rows.map((r) => r.id), byEntity, (ids, actorId) =>
        db.astAssignment
          .updateMany({ where: { id: { in: ids }, assignedByUserId: null }, data: { assignedByUserId: actorId } })
          .then((r) => r.count),
      );
    },
  },
  {
    label: "repairs.createdByUserId",
    module: "Repairs",
    actions: ["Sent to Repair"],
    countMissing: () => db.astRepair.count({ where: { createdByUserId: null } }),
    countFillable: (byEntity) =>
      db.astRepair.count({ where: { createdByUserId: null, id: { in: [...byEntity.keys()] } } }),
    apply: async (byEntity) => {
      const rows = await db.astRepair.findMany({
        where: { createdByUserId: null, id: { in: [...byEntity.keys()] } },
        select: { id: true },
      });
      return fillColumn(rows.map((r) => r.id), byEntity, (ids, actorId) =>
        db.astRepair
          .updateMany({ where: { id: { in: ids }, createdByUserId: null }, data: { createdByUserId: actorId } })
          .then((r) => r.count),
      );
    },
  },
];

async function main() {
  console.log(`${APPLY ? "APPLY" : "DRY-RUN"} — actor-attribution backfill from AstAuditLog\n`);
  let grandFilled = 0;

  for (const spec of SPECS) {
    const before = await spec.countMissing();
    const byEntity = await actorByEntity(spec.module, spec.actions);

    if (APPLY) {
      const filled = await spec.apply(byEntity);
      const after = await spec.countMissing();
      console.log(`  ${spec.label}: ${before} missing → filled ${filled}, ${after} still NULL`);
      grandFilled += filled;
    } else {
      const fillable = await spec.countFillable(byEntity);
      console.log(`  ${spec.label}: ${before} missing, ${fillable} fillable from audit log`);
    }
  }

  console.log(
    `\nSUMMARY: ${APPLY ? `filled ${grandFilled} row(s). Anything still NULL had no create-audit row (e.g. old bulk batches beyond the first unit).` : "re-run with --apply to perform."}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
