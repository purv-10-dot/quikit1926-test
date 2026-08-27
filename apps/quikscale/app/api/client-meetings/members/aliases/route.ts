import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { nameKeysFor, normalizeName } from "@/lib/ai/participantMatch";
import { writeAuditLog } from "@/lib/api/auditLog";
import { audit, requestContext } from "@/lib/audit";

/**
 * Client-member name aliases — the human's answer to "who is this speaker?".
 *
 * WHAT THIS CLOSES
 * ----------------
 * `participantMatch.ts` resolves a recording's speaker labels onto the roster.
 * Its fuzzy rung is advisory by design: a near-miss comes back as
 * `pendingConfirm` and `resolvedMemberId()` refuses to act on it, because
 * merging two similar names on a guess is how one person's blocker ends up
 * attributed to another.
 *
 * That design assumes a human can confirm. Until this route existed, none could:
 * `ClientMemberAlias` was READ by the report loader and the cache fingerprint
 * and WRITTEN by nothing. So a transcript spelling "Ashwin Signone" as "Ashwin
 * Singone" matched at jaro 0.976, was correctly withheld, and stayed unmapped
 * permanently — its own phantom row in every weekly report.
 *
 * One alias fixes it for that week and every week after, because the alias index
 * is rung 3 of the ladder — an exact lookup, not another guess.
 *
 * THE AMBIGUITY RULE
 * ------------------
 * The schema is blunt about it: "an ambiguous alias is worse than none". An
 * alias that could denote two different people would make the matcher resolve
 * confidently to the WRONG member — strictly worse than the honest "unmapped"
 * it replaces. So every write is refused when the alias collides with another
 * member's real name, any of their name keys, or an alias already recorded for
 * someone else.
 *
 * Saving an alias also changes the roster hash in `weeklyCacheState.ts`, so any
 * stored report for an affected week is flagged stale and the UI offers a
 * regeneration. Deliberately NOT regenerated here: that costs an AI call and can
 * clear a facilitator's sign-off, which must never happen as a side effect.
 */

export const runtime = "nodejs";

/**
 * `ClientMember` + `update`: an alias is a spelling of an existing member, so
 * whoever may edit that member may name them. DELETE is `update` too — removing
 * an alias edits the member's identity, it does not delete a member.
 */
const auth = withOrgAuthForResource("clientMeetings.members", "ClientMember");

const createSchema = z.object({
  clientMemberId: z.string().min(1, "clientMemberId is required"),
  /**
   * The spelling as the recording produced it. Length-capped because it is a
   * transcript label, not free text, and a 2-character floor keeps initials
   * ("A") from claiming a whole roster.
   */
  alias: z.string().trim().min(2, "Alias must be at least 2 characters").max(120),
  /**
   * Provenance, per the column's own contract: `"ai"` means the matcher
   * proposed this pairing and a human accepted it, `"manual"` means a human
   * chose the member outright. Both are human-confirmed — the distinction is
   * for later auditing of how good the suggestions actually are.
   */
  source: z.enum(["manual", "ai"]).default("manual"),
});

/**
 * POST /api/client-meetings/members/aliases
 * Body: { clientMemberId, alias }
 *
 * 201 on create, 200 when the same mapping already existed (idempotent, so a
 * double-click is not an error), 409 on an ambiguous or taken alias.
 */
export const POST = auth.update(async ({ orgId, userId }, request: NextRequest) => {
  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: parsed.error.issues[0]?.message ?? "Invalid input" },
      { status: 400 },
    );
  }

  const { clientMemberId, alias, source } = parsed.data;
  const normalizedAlias = normalizeName(alias);
  if (!normalizedAlias) {
    return NextResponse.json(
      { success: false, error: "Alias must contain at least one letter or number" },
      { status: 400 },
    );
  }

  // The member must be one of ours. Scoped by orgId, so a valid id from another
  // tenant reads as "not found" rather than leaking its existence.
  const member = await db.clientMember.findFirst({
    where: { id: clientMemberId, orgId, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!member) {
    return NextResponse.json({ success: false, error: "Client member not found" }, { status: 404 });
  }

  // Already resolves on its own — rung 2 (exact) or rung 4 (parenthetical) will
  // match it without help, so an alias row would be dead weight.
  if (nameKeysFor(member.name).includes(normalizedAlias)) {
    return NextResponse.json(
      {
        success: false,
        error: `"${alias}" already matches ${member.name} directly — no alias needed`,
      },
      { status: 400 },
    );
  }

  // Would this alias also denote somebody else? Checked against every name key
  // of every live member (full name, bracket-stripped, and the nickname inside
  // the brackets), which is exactly the set rung 2/4 look in.
  const others = await db.clientMember.findMany({
    where: { orgId, deletedAt: null, id: { not: member.id } },
    select: { id: true, name: true },
  });
  const clash = others.find((o) => nameKeysFor(o.name).includes(normalizedAlias));
  if (clash) {
    return NextResponse.json(
      {
        success: false,
        error: `"${alias}" is already the name of another member (${clash.name}). An ambiguous alias would misattribute their work — rename one of them instead.`,
      },
      { status: 409 },
    );
  }

  // `@@unique([orgId, normalizedAlias])` guarantees one owner per spelling.
  const taken = await db.clientMemberAlias.findFirst({
    where: { orgId, normalizedAlias },
    select: { id: true, clientMemberId: true, member: { select: { name: true } } },
  });
  if (taken) {
    if (taken.clientMemberId === member.id) {
      return NextResponse.json(
        { success: true, data: { id: taken.id, alias, clientMemberId: member.id, existed: true } },
        { status: 200 },
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: `"${alias}" is already mapped to ${taken.member?.name ?? "another member"}. Remove that mapping first.`,
      },
      { status: 409 },
    );
  }

  const created = await db.clientMemberAlias.create({
    data: { orgId, clientMemberId: member.id, alias, normalizedAlias, source, createdBy: userId },
    select: { id: true },
  });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "UPDATE",
    entityType: "ClientMember",
    entityId: member.id,
    newValues: { alias },
  });

  await audit.log({
    entityType: "CLIENT_MEMBER",
    entityId: member.id,
    action: "UPDATE",
    actor: { userId, orgId, teamId: null },
    snapshot: { name: member.name, alias },
    ...requestContext(request),
  });

  return NextResponse.json(
    { success: true, data: { id: created.id, alias, clientMemberId: member.id, existed: false } },
    { status: 201 },
  );
});

/**
 * DELETE /api/client-meetings/members/aliases?id=<aliasId>
 *
 * Undo for a mapping made in error. The speaker goes back to being reported as
 * unmapped, which is the honest state — never a silent wrong attribution.
 */
export const DELETE = auth.update(async ({ orgId, userId }, request: NextRequest) => {
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!id) {
    return NextResponse.json({ success: false, error: "id is required" }, { status: 400 });
  }

  const existing = await db.clientMemberAlias.findFirst({
    where: { id, orgId },
    select: { id: true, alias: true, clientMemberId: true },
  });
  if (!existing) {
    return NextResponse.json({ success: false, error: "Alias not found" }, { status: 404 });
  }

  await db.clientMemberAlias.delete({ where: { id: existing.id } });

  await writeAuditLog({
    orgId,
    actorId: userId,
    action: "UPDATE",
    entityType: "ClientMember",
    entityId: existing.clientMemberId,
    oldValues: { alias: existing.alias },
  });

  return NextResponse.json({ success: true, data: { id: existing.id } });
});
