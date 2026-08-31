/**
 * Backfill: link transcripts to the meeting occurrence they belong to.
 *
 * WHY
 * ---
 * `POST /api/client-meetings/transcripts/upload` used to create a transcript
 * with `weeklyMeetingId` and `dailyHuddleId` left null — only the Fathom ingest
 * path resolved them. Everything that reads a transcript THROUGH its meeting
 * (the Weekly Meeting Report, the Daily Huddle rollup) therefore could not see
 * a single hand-uploaded transcript: the meeting had no transcript, so there was
 * nothing to generate a report from.
 *
 * The route is fixed. This relinks the rows created before the fix, using the
 * exact same resolver, so no transcript needs re-uploading.
 *
 * SAFE TO RE-RUN. It only ever fills a null link, never changes one that is
 * already set, and never touches a transcript whose occurrence does not exist.
 *
 *   npx tsx --env-file=.env.local scripts/backfill-transcript-occurrence-links.ts
 *   npx tsx --env-file=.env.local scripts/backfill-transcript-occurrence-links.ts --apply
 *
 * Without `--apply` it is a dry run and prints what it would do.
 */

import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const apply = process.argv.includes("--apply");

/**
 * The resolver, inlined.
 *
 * `lib/meetings/linkOccurrence.ts` imports `@/lib/db`, which a plain tsx script
 * cannot resolve. The query is four lines and is covered by the route's own
 * tests; duplicating it here beats bending the module graph for a one-off.
 */
async function findOccurrence(
  orgId: string,
  clientId: string,
  type: "DAILY" | "WEEKLY",
  meetingDate: Date,
): Promise<{ dailyHuddleId: string | null; weeklyMeetingId: string | null }> {
  const gte = new Date(meetingDate);
  gte.setUTCHours(0, 0, 0, 0);
  const lt = new Date(gte);
  lt.setUTCDate(lt.getUTCDate() + 1);
  const meetingDay = { gte, lt };

  if (type === "DAILY") {
    const row = await db.clientDailyHuddle.findFirst({
      where: { orgId, clientId, deletedAt: null, meetingDate: meetingDay },
      select: { id: true },
    });
    return { dailyHuddleId: row?.id ?? null, weeklyMeetingId: null };
  }
  const row = await db.clientWeeklyMeeting.findFirst({
    where: { orgId, clientId, deletedAt: null, meetingDate: meetingDay },
    select: { id: true },
  });
  return { dailyHuddleId: null, weeklyMeetingId: row?.id ?? null };
}

async function main() {
  const orphans = await db.clientMeetingTranscript.findMany({
    where: {
      deletedAt: null,
      dailyHuddleId: null,
      weeklyMeetingId: null,
      clientId: { not: null },
      type: { not: null },
      meetingDate: { not: null },
    },
    orderBy: { meetingDate: "asc" },
    select: {
      id: true,
      orgId: true,
      clientId: true,
      type: true,
      meetingDate: true,
      title: true,
      client: { select: { name: true } },
    },
  });

  console.log(
    `${orphans.length} unlinked transcript(s) with a client, cadence and date.` +
      (apply ? "" : "  [dry run — pass --apply to write]"),
  );

  let linked = 0;
  let noOccurrence = 0;

  for (const t of orphans) {
    const type = t.type as "DAILY" | "WEEKLY";
    const link = await findOccurrence(t.orgId, t.clientId!, type, t.meetingDate!);
    const id = link.dailyHuddleId ?? link.weeklyMeetingId;
    const day = t.meetingDate!.toISOString().slice(0, 10);
    const label = `${day} ${type.padEnd(6)} ${t.client?.name ?? "?"} — ${t.title ?? "(untitled)"}`;

    if (!id) {
      noOccurrence += 1;
      console.log(`  ·  no meeting scheduled  ${label}`);
      continue;
    }

    if (apply) {
      await db.clientMeetingTranscript.update({
        where: { id: t.id },
        data: { dailyHuddleId: link.dailyHuddleId, weeklyMeetingId: link.weeklyMeetingId },
      });
    }
    linked += 1;
    console.log(`  ${apply ? "✓" : "→"} ${id}  ${label}`);
  }

  console.log(
    `\n${apply ? "Linked" : "Would link"} ${linked}; ` +
      `${noOccurrence} have no meeting on that date — create the meeting in the ` +
      `Weekly Meeting / Daily Huddle module, then re-run.`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => db.$disconnect());
