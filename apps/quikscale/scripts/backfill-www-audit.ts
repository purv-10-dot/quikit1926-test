/**
 * One-time data backfill: legacy AuditLog (entityType="WWWItem") → new
 * AuditEvent / AuditChange (entityType="WWW").
 *
 * Run MANUALLY, once per environment, AFTER the audit schema migrations are
 * applied. Mirrors scripts/backfill-priority-audit.ts.
 *
 * Usage (from the repo root):
 *   npx tsx apps/quikscale/scripts/backfill-www-audit.ts --dry-run
 *   npx tsx apps/quikscale/scripts/backfill-www-audit.ts
 *   npx tsx apps/quikscale/scripts/backfill-www-audit.ts --before 2026-06-10T00:00:00Z
 *
 * Idempotent: AuditEvent.id reuses AuditLog.id, AuditChange.id = `${logId}_c${n}`,
 * inserts use skipDuplicates — safe to re-run.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";
import { mapWWWAuditLog, isAggregateLog, type LegacyAuditLog } from "../lib/audit/wwwBackfill";
import { isMeaningfulEvent } from "../lib/audit/timeline";

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

  const { db, Prisma } = await import("@quikit/database");

  const toJson = (v: unknown) =>
    v === null || v === undefined ? Prisma.JsonNull : (v as object);

  console.log(
    `AuditLog(WWWItem) → AuditEvent(WWW) backfill ${args.dryRun ? "(DRY RUN)" : ""}\n` +
      `  before:  ${args.before.toISOString()}\n  batch:   ${args.batch}\n`,
  );

  const userNameCache = new Map<string, string>();

  const where = { entityType: "WWWItem", createdAt: { lt: args.before } } as const;
  const total = await db.auditLog.count({ where });
  console.log(`Found ${total} AuditLog(WWWItem) rows to process.\n`);

  let cursorId: string | undefined;
  let processed = 0;
  let eventsCreated = 0;
  let changesCreated = 0;
  let skipped = 0;
  const actionTally: Record<string, number> = {};

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const batch = (await db.auditLog.findMany({
      where,
      orderBy: { id: "asc" },
      take: args.batch,
      ...(cursorId ? { skip: 1, cursor: { id: cursorId } } : {}),
      select: {
        id: true, orgId: true, entityId: true, action: true,
        oldValues: true, newValues: true, actorId: true, reason: true, createdAt: true,
      },
    })) as LegacyAuditLog[];

    if (batch.length === 0) break;

    const missingUsers = [...new Set(batch.map((l) => l.actorId))].filter((id) => !userNameCache.has(id));
    if (missingUsers.length) {
      const users = await db.user.findMany({
        where: { id: { in: missingUsers } },
        select: { id: true, firstName: true, lastName: true },
      });
      for (const u of users) userNameCache.set(u.id, fullName(u.firstName, u.lastName));
      for (const id of missingUsers) if (!userNameCache.has(id)) userNameCache.set(id, "—");
    }

    const eventRows: object[] = [];
    const changeRows: object[] = [];
    for (const log of batch) {
      if (isAggregateLog(log)) { skipped++; continue; }

      const { event, changes } = mapWWWAuditLog(log, {
        actorName: userNameCache.get(log.actorId) ?? "—",
      });
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
      `  AuditLog processed: ${processed}\n` +
      `  Skipped (aggregate / empty UPDATE): ${skipped}\n` +
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
