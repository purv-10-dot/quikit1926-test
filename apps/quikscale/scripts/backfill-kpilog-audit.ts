/**
 * One-time data backfill: legacy KPILog → new AuditEvent / AuditChange.
 *
 * Run MANUALLY, once per environment, AFTER the schema migration
 * (20260609120000_add_audit_event_change_authlog) has been applied.
 *
 * Usage (from the repo root):
 *   npx tsx apps/quikscale/scripts/backfill-kpilog-audit.ts --dry-run
 *   npx tsx apps/quikscale/scripts/backfill-kpilog-audit.ts
 *   npx tsx apps/quikscale/scripts/backfill-kpilog-audit.ts --before 2026-06-09T00:00:00Z
 *
 * Flags:
 *   --dry-run         Parse + map + print counts; write NOTHING.
 *   --before <ISO>    Only migrate KPILog rows older than this (default: now).
 *                     Set to the dual-write deploy time on uat/prod to avoid
 *                     double-counting the overlap window. (Dev is empty → moot.)
 *   --batch <n>       Rows per batch (default 500).
 *
 * Idempotent: AuditEvent.id reuses KPILog.id, AuditChange.id = `${logId}_c${n}`,
 * and inserts use skipDuplicates — safe to re-run.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { mapKpiLog, type LegacyKpiLog } from "../lib/audit/backfill";
import { isMeaningfulEvent } from "../lib/audit/timeline";

// Load DB credentials BEFORE importing @quikit/database (its client
// instantiates at import time and needs DATABASE_URL). Try the package env
// first, then the app env. Paths are relative to the repo-root cwd.
loadEnv({ path: resolve(process.cwd(), "packages/database/.env") });
loadEnv({ path: resolve(process.cwd(), "apps/quikscale/.env") });

interface Args {
  dryRun: boolean;
  before: Date;
  batch: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, before: new Date(), batch: 500 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--dry-run") args.dryRun = true;
    else if (a === "--before") args.before = new Date(argv[++i]!);
    else if (a?.startsWith("--before=")) args.before = new Date(a.split("=")[1]!);
    else if (a === "--batch") args.batch = parseInt(argv[++i]!, 10);
    else if (a?.startsWith("--batch=")) args.batch = parseInt(a.split("=")[1]!, 10);
  }
  return args;
}

function fullName(firstName?: string | null, lastName?: string | null): string {
  return `${firstName ?? ""} ${lastName ?? ""}`.trim() || "—";
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    console.error(
      "DATABASE_URL is not set. Run this from the repo root so packages/database/.env loads, " +
        "or export DATABASE_URL before running.",
    );
    process.exit(1);
  }
  if (isNaN(args.before.getTime())) {
    console.error("Invalid --before date.");
    process.exit(1);
  }

  // Dynamic import so the env above is in place before the client instantiates.
  const { db, Prisma } = await import("@quikit/database");

  const toJson = (v: unknown) =>
    v === null || v === undefined ? Prisma.JsonNull : (v as object);

  console.log(
    `KPILog → AuditEvent backfill ${args.dryRun ? "(DRY RUN)" : ""}\n` +
      `  before:  ${args.before.toISOString()}\n  batch:   ${args.batch}\n`,
  );

  const userNameCache = new Map<string, string>();
  const teamIdCache = new Map<string, string | null>();

  const total = await db.kPILog.count({ where: { createdAt: { lt: args.before } } });
  console.log(`Found ${total} KPILog rows to process.\n`);

  let cursorId: string | undefined;
  let processed = 0;
  let eventsCreated = 0;
  let changesCreated = 0;
  let skipped = 0;
  const actionTally: Record<string, number> = {};

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = (await db.kPILog.findMany({
      where: { createdAt: { lt: args.before } },
      orderBy: { id: "asc" },
      take: args.batch,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      select: {
        id: true, orgId: true, kpiId: true, action: true,
        oldValue: true, newValue: true, changedBy: true, reason: true, createdAt: true,
      },
    })) as LegacyKpiLog[];

    if (batch.length === 0) break;

    // Resolve any missing actor names + team ids for this batch.
    const missingUsers = [...new Set(batch.map((l) => l.changedBy))].filter((id) => !userNameCache.has(id));
    if (missingUsers.length) {
      const users = await db.user.findMany({
        where: { id: { in: missingUsers } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const u of users) userNameCache.set(u.id, fullName(u.firstName, u.lastName));
      for (const id of missingUsers) if (!userNameCache.has(id)) userNameCache.set(id, "—");
    }
    const missingKpis = [...new Set(batch.map((l) => l.kpiId))].filter((id) => !teamIdCache.has(id));
    if (missingKpis.length) {
      const kpis = await db.kPI.findMany({
        where: { id: { in: missingKpis } },
        select: { id: true, teamId: true },
      });
      for (const k of kpis) teamIdCache.set(k.id, k.teamId ?? null);
      for (const id of missingKpis) if (!teamIdCache.has(id)) teamIdCache.set(id, null);
    }

    const eventRows: object[] = [];
    const changeRows: object[] = [];
    for (const log of batch) {
      const { event, changes } = mapKpiLog(log, {
        actorName: userNameCache.get(log.changedBy) ?? "—",
        teamId: teamIdCache.get(log.kpiId) ?? null,
      });
      // Skip the empty-UPDATE noise (legacy recompute logs with no field
      // changes) so it's never created in fresh environments. Uses the same
      // shared predicate the Change History panel prunes with at read time.
      if (!isMeaningfulEvent({ action: event.action, changes, snapshot: event.snapshot })) {
        skipped++;
        continue;
      }
      actionTally[event.action] = (actionTally[event.action] ?? 0) + 1;
      eventRows.push({
        id: event.id,
        orgId: event.orgId,
        teamId: event.teamId,
        entityType: event.entityType,
        entityId: event.entityId,
        action: event.action,
        actorUserId: event.actorUserId,
        actorName: event.actorName,
        source: event.source,
        reason: event.reason,
        snapshot: toJson(event.snapshot),
        createdAt: event.createdAt,
      });
      for (const c of changes) {
        changeRows.push({
          id: c.id,
          auditEventId: event.id,
          fieldName: c.fieldName,
          oldValue: toJson(c.oldValue),
          newValue: toJson(c.newValue),
        });
      }
    }

    if (!args.dryRun) {
      const ev = await db.auditEvent.createMany({ data: eventRows as never, skipDuplicates: true });
      eventsCreated += ev.count;
      if (changeRows.length) {
        const ch = await db.auditChange.createMany({ data: changeRows as never, skipDuplicates: true });
        changesCreated += ch.count;
      }
    } else {
      eventsCreated += eventRows.length;
      changesCreated += changeRows.length;
    }

    processed += batch.length;
    cursorId = batch[batch.length - 1]!.id;
    console.log(`  …processed ${processed}/${total}`);
  }

  console.log(
    `\nDone${args.dryRun ? " (dry run — nothing written)" : ""}.\n` +
      `  KPILog processed:   ${processed}\n` +
      `  Skipped (empty UPDATE noise): ${skipped}\n` +
      `  AuditEvents ${args.dryRun ? "to create" : "created"}: ${eventsCreated}\n` +
      `  AuditChanges ${args.dryRun ? "to create" : "created"}: ${changesCreated}\n` +
      `  By action: ${JSON.stringify(actionTally)}`,
  );

  await db.$disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
