/**
 * Diagnose "the Teams meeting has no title".
 *
 * WHY THIS EXISTS
 * ---------------
 * Static reading of the code says a blank subject is impossible: the direct
 * button path hard-codes `${title} — ${spec.name}` (connectors/index.ts), the
 * workflow-action path runs every candidate through `firstString()` which skips
 * blanks, and `toGraphEvent` only emits `subject` when it is not undefined.
 * So an untitled block on the calendar is either (a) not our event at all, or
 * (b) our event living on a mailbox nobody is looking at.
 *
 * Guessing between those two costs a wrong fix. This asks Microsoft Graph
 * directly, for the exact events QuikFlow believes it owns, and prints the raw
 * `subject` byte-for-byte.
 *
 * IT DELIBERATELY BYPASSES `listCalendarView`
 * -------------------------------------------
 * That helper coerces a missing subject to the string "(no subject)" — the very
 * distinction under audit. It reads `/me/events/{id}` raw instead.
 *
 * READ-ONLY. Creates, updates and deletes nothing.
 *
 * USAGE
 *   cd apps/quikflow
 *   node --env-file=.env.local --import tsx scripts/diagnose-calendar-title.ts <orgId> [clientId]
 *
 * Needs DATABASE_URL plus the Microsoft app env the connector already uses.
 */
import { db } from "@quikit/database";
import { getCalendarProvider, getFreshAccessToken } from "@/lib/connectors";

const GRAPH = "https://graph.microsoft.com/v1.0";

const CONNECTION_SELECT = {
  id: true,
  orgId: true,
  provider: true,
  label: true,
  accessToken: true,
  refreshToken: true,
  expiresAt: true,
  settings: true,
} as const;

/** Make invisible differences visible: empty string vs missing vs whitespace. */
function showSubject(raw: unknown): string {
  if (raw === undefined) return "<<FIELD ABSENT from Graph response>>";
  if (raw === null) return "<<null>>";
  if (typeof raw !== "string") return `<<non-string: ${typeof raw}>>`;
  if (raw === "") return "<<EMPTY STRING>>";
  if (!raw.trim()) return `<<WHITESPACE ONLY (${raw.length} chars)>>`;
  return `"${raw}"  (${raw.length} chars)`;
}

async function main() {
  const [orgId, clientId] = process.argv.slice(2);
  if (!orgId) {
    console.error("Usage: diagnose-calendar-title.ts <orgId> [clientId]");
    process.exit(1);
  }

  console.log(`\n=== 1. Calendar connection for org ${orgId} ===`);
  const conn = await db.wfConnection.findFirst({
    where: { orgId, status: "connected", provider: { in: ["teams"] } },
    orderBy: { createdAt: "asc" },
    select: CONNECTION_SELECT,
  });
  if (!conn) {
    console.log("NO connected Teams calendar for this org. Nothing was ever created.");
    return;
  }
  console.log(`connection id : ${conn.id}`);
  console.log(`provider      : ${conn.provider}`);
  console.log(`MAILBOX       : ${conn.label}   <-- events land HERE, on this account's /me/events`);

  console.log(`\n=== 2. Events QuikFlow believes it owns ===`);
  const links = await db.wfCalendarLink.findMany({
    where: { orgId, refType: "clientMaster", ...(clientId ? { refId: clientId } : {}) },
    orderBy: { createdAt: "asc" },
  });
  if (links.length === 0) {
    console.log("NO WfCalendarLink rows. QuikFlow never successfully created any meeting.");
    console.log("=> The untitled block on your calendar is NOT ours.");
    return;
  }
  console.log(`${links.length} link row(s).`);

  const provider = getCalendarProvider(conn.provider);
  if (!provider) {
    console.log(`No provider impl for "${conn.provider}" — cannot query Graph.`);
    return;
  }
  const accessToken = await getFreshAccessToken(conn);

  console.log(`\n=== 3. Raw Graph state per event ===`);
  for (const link of links) {
    console.log(`\n--- refId=${link.refId} kind=${link.kind || "(none)"} ---`);
    console.log(`externalEventId: ${link.externalEventId}`);
    if (link.externalEventId === "__pending__") {
      console.log("STATUS: claim row never resolved — creation crashed mid-flight. No real event exists.");
      continue;
    }
    const res = await fetch(
      `${GRAPH}/me/events/${encodeURIComponent(link.externalEventId)}` +
        `?$select=id,subject,start,end,originalStartTimeZone,isOnlineMeeting,organizer,attendees,type,seriesMasterId`,
      { headers: { Authorization: `Bearer ${accessToken}` } },
    );
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
    if (!res.ok) {
      const msg = (json as { error?: { message?: string } })?.error?.message ?? `HTTP ${res.status}`;
      console.log(`STATUS: Graph ${res.status} — ${msg}`);
      if (res.status === 404) console.log("=> Event was deleted on the calendar; the link is stale.");
      continue;
    }
    const start = json.start as { dateTime?: string; timeZone?: string } | undefined;
    const end = json.end as { dateTime?: string; timeZone?: string } | undefined;
    const organizer = json.organizer as { emailAddress?: { address?: string } } | undefined;
    const attendees = (json.attendees ?? []) as Array<{
      type?: string;
      emailAddress?: { address?: string };
    }>;
    console.log(`SUBJECT        : ${showSubject(json.subject)}`);
    console.log(`type           : ${String(json.type)}`);
    console.log(`start          : ${start?.dateTime} (${start?.timeZone})`);
    console.log(`end            : ${end?.dateTime} (${end?.timeZone})`);
    console.log(`isOnlineMeeting: ${String(json.isOnlineMeeting)}`);
    console.log(`organizer      : ${organizer?.emailAddress?.address ?? "?"}`);
    console.log(
      `attendees      : ${
        attendees.length
          ? attendees.map((a) => `${a.emailAddress?.address ?? "?"} [${a.type ?? "?"}]`).join(", ")
          : "(none)"
      }`,
    );
  }

  console.log(`\n=== 4. How to read this ===`);
  console.log(`If every SUBJECT above is a real string, the untitled block you saw in Teams`);
  console.log(`is not one of these events — it is an unsaved draft in the New-event composer,`);
  console.log(`or an event created outside QuikFlow. Compare the MAILBOX in section 1 against`);
  console.log(`the account whose calendar you were looking at, and check whether your own`);
  console.log(`address appears in the attendees list above.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
