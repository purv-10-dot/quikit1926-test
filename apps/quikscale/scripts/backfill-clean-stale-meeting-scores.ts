/**
 * One-time data cleanup: delete ClientWeeklyMemberScore rows that are stale
 * because the member is (now) flagged Absent or Dashboard-NA for that same
 * meeting. Those rows are what let the Meeting Rhythm dashboard's "Quality of
 * the dashboards" cell and the Member Punch-In Excel export ("Total Average
 * of All Members") disagree — the dashboard used to average every saved score
 * unconditionally, while the export always excluded AB/NA weeks. Both code
 * paths now exclude AB/NA members (see clientMeetingsMath.ts), and new saves
 * are prevented by the PUT/PATCH routes — this script only cleans up rows
 * left over from before that fix shipped.
 *
 * Run MANUALLY, once per environment, after deploying the AB/NA guard changes.
 *
 * Usage (from the repo root):
 *   npx tsx apps/quikscale/scripts/backfill-clean-stale-meeting-scores.ts --dry-run
 *   npx tsx apps/quikscale/scripts/backfill-clean-stale-meeting-scores.ts
 *   npx tsx apps/quikscale/scripts/backfill-clean-stale-meeting-scores.ts --org=<orgId> --dry-run
 *
 * Idempotent: safe to re-run — a run with nothing stale left deletes 0 rows.
 */
import { config as loadEnv } from "dotenv";
import { resolve } from "path";

loadEnv({ path: resolve(process.cwd(), "packages/database/.env") });
loadEnv({ path: resolve(process.cwd(), "apps/quikscale/.env") });

interface Args {
  dryRun: boolean;
  orgId: string | undefined;
}

function parseArgs(argv: string[]): Args {
  const args: Args = { dryRun: false, orgId: undefined };
  for (const a of argv) {
    if (a === "--dry-run") args.dryRun = true;
    else if (a.startsWith("--org=")) args.orgId = a.split("=")[1];
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL is not set. Run from the repo root.");
    process.exit(1);
  }

  const { db } = await import("@quikit/database");

  console.log(`Stale client-meeting score cleanup ${args.dryRun ? "(DRY RUN)" : ""}${args.orgId ? ` — org ${args.orgId}` : ""}\n`);

  const meetings = await db.clientWeeklyMeeting.findMany({
    where: {
      deletedAt: null,
      ...(args.orgId ? { orgId: args.orgId } : {}),
      memberScores: { some: {} },
      OR: [{ absentTeamMembers: { some: {} } }, { dashboardNATeamMembers: { some: {} } }],
    },
    select: {
      id: true,
      orgId: true,
      clientId: true,
      meetingDate: true,
      memberScores: { select: { id: true, clientMemberId: true } },
      absentTeamMembers: { select: { clientMemberId: true } },
      dashboardNATeamMembers: { select: { clientMemberId: true } },
    },
  });

  console.log(`Scanned ${meetings.length} meetings with both scores and an Absent/NA flag.`);

  let staleRows = 0;
  const staleIds: string[] = [];
  for (const m of meetings) {
    const flagged = new Set([
      ...m.absentTeamMembers.map((a) => a.clientMemberId),
      ...m.dashboardNATeamMembers.map((a) => a.clientMemberId),
    ]);
    const stale = m.memberScores.filter((s) => flagged.has(s.clientMemberId));
    if (stale.length) {
      staleRows += stale.length;
      staleIds.push(...stale.map((s) => s.id));
      console.log(
        `  meeting ${m.id} (org ${m.orgId}, client ${m.clientId}, ${m.meetingDate.toISOString().slice(0, 10)}): ` +
        `${stale.length} stale score row(s) for member(s) ${stale.map((s) => s.clientMemberId).join(", ")}`
      );
    }
  }

  console.log(`\nFound ${staleRows} stale score row(s) across ${meetings.length} meetings.`);

  if (args.dryRun) {
    console.log("Dry run — no rows deleted.");
    return;
  }

  if (staleIds.length) {
    const { count } = await db.clientWeeklyMemberScore.deleteMany({ where: { id: { in: staleIds } } });
    console.log(`Deleted ${count} stale score row(s).`);
  } else {
    console.log("Nothing to delete.");
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    const { db } = await import("@quikit/database");
    await db.$disconnect();
  });
