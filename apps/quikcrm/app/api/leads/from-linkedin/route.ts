import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyExtensionToken } from "@/lib/auth/extension-token";
import {
  mergeLinkedInConversation,
  type StoredConversation,
} from "@/lib/services/prospects/merge-linkedin-conversation";
import { ensureDefaultActivityTypes } from "@/lib/services/activity-types/ensure-defaults";
import { readTzFromHeaders } from "@/lib/services/dashboard/filters";
import {
  LINKEDIN_CONVERSATION_CODE,
  LINKEDIN_CONVERSATION_LABEL,
  LINKEDIN_SOURCE_SYSTEM,
  linkedInConversationExternalId,
} from "@/lib/services/activities/linkedin-conversation-activity";
import { logActivity } from "@/lib/services/activities/log-activity";
import { STANDALONE_KIND, STANDALONE_RELATED_ID } from "@/lib/services/activities/target-existence";

export const runtime = "nodejs";

/**
 * POST /api/leads/from-linkedin
 *
 * "Save to CRM" target for the LinkedIn Chrome extension. Persists the extracted
 * profile into the standalone CrmProspect table (NOT a CrmLead) and lists it on
 * the Prospects settings page.
 *
 * Auth: Bearer JWT minted by /api/extension-auth/callback (the extension does
 * not carry the app's session cookie), verified via verifyExtensionToken. The
 * caller must be an active member of the posted orgId; if no orgId is supplied
 * we fall back to their first active org membership.
 *
 * Idempotent per (orgId, linkedinUrl): re-saving the same profile updates the
 * existing prospect instead of creating a duplicate.
 */

// The extension sends a rich payload; we accept and store the profile-shaped
// subset. Unknown extras are ignored. `posts` / `companyData` / `experiences`
// are opaque blobs owned by the extension — kept verbatim as JSON.
const jsonValue: z.ZodType<Prisma.InputJsonValue> = z.any();

/**
 * One LinkedIn chat message. Validated structurally (unlike the opaque blobs
 * above) because the CRM renders it directly — malformed entries must be
 * rejected at the boundary rather than crashing the chat modal.
 *
 * Every field except `text` is nullable: the extractor returns null for
 * anything LinkedIn does not expose and must never invent data.
 *
 * Limits are generous by design. The brief is explicit that valid message text
 * must not be truncated and valid messages must not be silently dropped, so
 * these are DoS guards set far above any real thread, not business rules — a
 * payload past them is rejected with an error, never quietly trimmed.
 */
const MAX_MESSAGES = 5000;
const MAX_TEXT_LEN = 20000;

const conversationMessageSchema = z.object({
  messageId: z.string().max(300).nullish(),
  senderName: z.string().max(300).nullish(),
  senderProfileUrl: z.string().max(2000).nullish(),
  receiverName: z.string().max(300).nullish(),
  text: z.string().max(MAX_TEXT_LEN).nullish(),
  timestamp: z.string().max(100).nullish(),
  date: z.string().max(100).nullish(),
  time: z.string().max(100).nullish(),
  direction: z.enum(["sent", "received"]).nullish(),
  messageOrder: z.number().int().nonnegative().optional(),
  source: z.string().max(50).optional(),
  attachments: z
    .array(
      z.object({
        type: z.string().max(50).nullish(),
        name: z.string().max(500).nullish(),
        url: z.string().max(2000).nullish(),
      }),
    )
    .max(50)
    .optional(),
});

/**
 * The conversation payload. Accepts either the extractor's full envelope
 * ({ participant, threadId, messages }) or a bare message array, so the
 * extension can evolve without breaking this route.
 */
const linkedinConversationSchema = z.union([
  z.array(conversationMessageSchema).max(MAX_MESSAGES),
  z.object({
    participant: z
      .object({
        name: z.string().max(300).nullish(),
        profileUrl: z.string().max(2000).nullish(),
      })
      .nullish(),
    threadId: z.string().max(300).nullish(),
    messages: z.array(conversationMessageSchema).max(MAX_MESSAGES),
  }),
]);

type ConversationMessage = z.infer<typeof conversationMessageSchema>;

/**
 * Normalise to the stored shape: an ordered array with an explicit
 * `messageOrder` and `source` on every element.
 *
 * NO DEDUPLICATION. A thread legitimately repeats identical text from
 * different senders — "Well" three times, "No problem" twice — and each is a
 * distinct message. Order is assigned by array position, which is the
 * extractor's chronological order (oldest → newest).
 */
function normaliseConversation(
  input: z.infer<typeof linkedinConversationSchema>,
): Prisma.InputJsonValue | undefined {
  const messages: ConversationMessage[] = Array.isArray(input) ? input : input.messages;
  if (!Array.isArray(messages)) return undefined;

  const participant = Array.isArray(input) ? null : (input.participant ?? null);
  const threadId = Array.isArray(input) ? null : (input.threadId ?? null);

  return {
    participant: participant
      ? { name: participant.name ?? null, profileUrl: participant.profileUrl ?? null }
      : null,
    threadId: threadId ?? null,
    capturedAt: new Date().toISOString(),
    messageCount: messages.length,
    messages: messages.map((m, i) => ({
      messageId: m.messageId ?? null,
      senderName: m.senderName ?? null,
      senderProfileUrl: m.senderProfileUrl ?? null,
      receiverName: m.receiverName ?? null,
      text: m.text ?? null,
      timestamp: m.timestamp ?? null,
      date: m.date ?? null,
      time: m.time ?? null,
      direction: m.direction ?? null,
      // Position in the extractor's chronological array is authoritative; a
      // caller-supplied messageOrder is honoured only when present.
      messageOrder: typeof m.messageOrder === "number" ? m.messageOrder : i + 1,
      source: m.source ?? "LINKEDIN",
      attachments: Array.isArray(m.attachments)
        ? m.attachments.map((a) => ({
            type: a.type ?? null,
            name: a.name ?? null,
            url: a.url ?? null,
          }))
        : [],
    })),
  } as Prisma.InputJsonValue;
}

const fromLinkedinSchema = z.object({
  orgId: z.string().min(1).optional(),
  name: z.string().trim().optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  title: z.string().trim().optional(),
  company: z.string().trim().optional(),
  linkedinUrl: z.string().trim().optional(),
  // Set only when the extension's "Select Prospect" dropdown has an existing
  // prospect chosen. Switches the write from upsert-by-URL to update-by-id, so
  // an existing prospect is never duplicated.
  prospectId: z.string().trim().optional(),
  shortSummary: z.string().trim().optional(),
  about: z.string().trim().optional(),
  profilePicture: z.string().trim().optional(),
  posts: jsonValue.optional(),
  companyData: jsonValue.optional(),
  experiences: jsonValue.optional(),
  // Full LinkedIn chat thread, when the user ran "Extract Conversation" before
  // saving. Absent on every other save — the prospect flow is unchanged.
  linkedinConversation: linkedinConversationSchema.optional(),
  // ICP chosen in the extension before saving. Optional — saving without one is
  // valid and leaves the prospect (and any lead converted from it) untagged.
  icpId: z.string().trim().optional(),
  // Accepted for backward-compat with the current extension payload; not used
  // by the prospect record itself.
  searchEmailEnabled: z.boolean().optional(),
});

/** Empty string → undefined, so blank optional fields don't overwrite existing values. */
function clean(v: string | undefined): string | undefined {
  const t = v?.trim();
  return t ? t : undefined;
}

/**
 * The subset of the extension's company blob that we promote to real columns.
 * Everything the scraper produces stays in `companyData`; this is the queryable
 * projection of it.
 */
type PromotedCompanyFields = {
  companyIndustry?: string | null;
  companyWebsite?: string | null;
  companyHeadquarters?: string | null;
  companySize?: string | null;
  companyEmployeeCount?: number | null;
  companyLinkedinUrl?: string | null;
};

/**
 * Derive the promoted company columns from the `companyData` blob.
 *
 * Derived SERVER-SIDE rather than sent as separate wire fields, so the blob
 * stays the single source of truth and the extension needs no change. A field
 * absent from the blob is simply omitted (not written as null), which keeps a
 * partial re-save from clearing data captured by an earlier, richer scrape —
 * the same rule the JSON blobs already follow.
 */
function promoteCompanyFields(companyData: unknown): PromotedCompanyFields {
  if (!companyData || typeof companyData !== 'object' || Array.isArray(companyData)) {
    return {};
  }
  const c = companyData as Record<string, unknown>;
  const str = (v: unknown): string | undefined => {
    if (typeof v !== 'string') return undefined;
    const t = v.trim();
    return t ? t : undefined;
  };

  const out: PromotedCompanyFields = {};

  const industry = str(c.industry);
  if (industry) out.companyIndustry = industry;

  const website = str(c.website);
  if (website) out.companyWebsite = website;

  // `headquarters` is canonical; `location` is the scraper's legacy alias.
  const hq = str(c.headquarters) ?? str(c.location);
  if (hq) out.companyHeadquarters = hq;

  const size = str(c.companySize);
  if (size) out.companySize = size;

  const companyUrl = str(c.companyUrl);
  if (companyUrl) out.companyLinkedinUrl = companyUrl;

  // Headcount: the scraper stores it as a string ("32"), and LinkedIn also
  // renders banded values ("10K+ employees") that carry no exact figure. Parse
  // only a clean integer; anything else stays represented by companySize alone.
  const rawEmployees = c.employees;
  const employeeText =
    typeof rawEmployees === 'number' ? String(rawEmployees) : str(rawEmployees);
  if (employeeText && /^\d[\d,]*$/.test(employeeText)) {
    const n = Number.parseInt(employeeText.replace(/,/g, ''), 10);
    if (Number.isFinite(n) && n >= 0) out.companyEmployeeCount = n;
  }

  return out;
}

export async function POST(request: NextRequest) {
  try {
    const nextAuthSecret = process.env.NEXTAUTH_SECRET;
    if (!nextAuthSecret) {
      return NextResponse.json(
        { success: false, error: "Server misconfigured" },
        { status: 500 },
      );
    }

    const extUser = await verifyExtensionToken(request);
    if (!extUser) {
      return NextResponse.json(
        { success: false, error: "Unauthorized" },
        { status: 401 },
      );
    }

    const body = await request.json().catch(() => null);
    const parsed = fromLinkedinSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Validation failed", errors: parsed.error.flatten().fieldErrors },
        { status: 400 },
      );
    }
    const data = parsed.data;

    // Resolve target org: honor the posted orgId only if the caller is an active
    // member of it; otherwise fall back to their first active membership.
    let orgId = clean(data.orgId);
    if (orgId) {
      const membership = await db.orgMember.findFirst({
        where: { userId: extUser.userId, orgId, status: "active", org: { status: "active" } },
        select: { orgId: true },
      });
      if (!membership) {
        return NextResponse.json(
          { success: false, error: "Not a member of the selected organization" },
          { status: 403 },
        );
      }
    } else {
      const first = await db.orgMember.findFirst({
        where: { userId: extUser.userId, status: "active", org: { status: "active" } },
        select: { orgId: true },
        orderBy: { createdAt: "asc" },
      });
      if (!first) {
        return NextResponse.json(
          { success: false, error: "No active organization for this user" },
          { status: 403 },
        );
      }
      orgId = first.orgId;
    }

    const name = clean(data.name);
    if (!name) {
      return NextResponse.json(
        { success: false, error: "Name is required" },
        { status: 400 },
      );
    }

    const linkedinUrl = clean(data.linkedinUrl);
    const savedByName = extUser.name || extUser.email || null;

    // Validate the ICP against the RESOLVED org, not the posted one: a client
    // could otherwise attach another tenant's ICP by guessing a cuid. Also
    // requires the profile to be active + not trashed, matching the dropdown the
    // extension populated from /api/extension-auth/icp.
    const icpId = clean(data.icpId);
    if (icpId) {
      const icp = await db.crmIcpProfile.findFirst({
        where: { id: icpId, orgId, isActive: true, deletedAt: null },
        select: { id: true },
      });
      if (!icp) {
        return NextResponse.json(
          { success: false, error: "Selected ICP not found for this organization" },
          { status: 400 },
        );
      }
    }

    // Shared scalar fields for both create and update. JSON blobs are only set
    // when present so a partial re-save doesn't wipe previously captured data.
    const jsonFields = {
      ...(data.posts !== undefined ? { posts: data.posts as Prisma.InputJsonValue } : {}),
      ...(data.companyData !== undefined ? { companyData: data.companyData as Prisma.InputJsonValue } : {}),
      ...(data.experiences !== undefined ? { experiences: data.experiences as Prisma.InputJsonValue } : {}),
      // Conversation is handled separately below: it is an INCREMENTAL merge
      // against whatever is already stored, so it needs a read first and
      // cannot be a blind overwrite like the blobs above.
    };

    // Queryable projection of the company blob. Spread with the JSON fields so
    // it follows the same "only write what was sent" rule: re-saving from a
    // profile page (no companyData) leaves previously captured company columns
    // untouched rather than nulling them.
    const companyFields = promoteCompanyFields(data.companyData);
    const scalarFields = {
      name,
      email: clean(data.email) ?? null,
      phone: clean(data.phone) ?? null,
      title: clean(data.title) ?? null,
      company: clean(data.company) ?? null,
      shortSummary: clean(data.shortSummary) ?? null,
      about: clean(data.about) ?? null,
      profilePicture: clean(data.profilePicture) ?? null,
      savedById: extUser.userId,
      savedByName,
    };
    // Only written when the caller actually sent one, so a re-save from an older
    // extension build (no ICP field) cannot clear a previously chosen ICP. Same
    // reasoning as the JSON blobs above.
    const icpFields = icpId ? { icpId } : {};

    // EXISTING-PROSPECT PATH. When the extension's "Select Prospect" dropdown
    // has a prospect chosen, it sends that prospect's real id and we UPDATE it
    // in place — never an upsert, so a duplicate cannot be created even if the
    // profile's linkedinUrl differs from the stored one.
    //
    // The client blocks the save when the open LinkedIn profile does not match
    // the selected prospect; this is the server-side half of that guard: the id
    // is scoped to the resolved org, so an id from another organisation 404s
    // rather than being written to.
    let prospectFromId: Awaited<ReturnType<typeof db.crmProspect.update>> | null = null;
    const prospectId = clean(data.prospectId);
    if (prospectId) {
      const existing = await db.crmProspect.findFirst({
        where: { id: prospectId, orgId },
        select: { id: true },
      });
      if (!existing) {
        return NextResponse.json(
          { success: false, error: "Selected prospect not found in this organization" },
          { status: 404 },
        );
      }
      prospectFromId = await db.crmProspect.update({
        where: { id: existing.id },
        // linkedinUrl is deliberately NOT overwritten here: the prospect's
        // identity URL is what the client matched against, and rewriting it
        // would let a mismatched save silently re-point the record.
        data: { ...scalarFields, ...jsonFields, ...companyFields, ...icpFields },
      });
    }

    // Upsert on (orgId, linkedinUrl) when we have a URL; otherwise always create
    // (URL-less captures can't be deduped and Postgres treats NULLs as distinct).
    let prospect;
    if (prospectFromId) {
      // Already written above by the existing-prospect path; fall through to the
      // shared activity log + response so both paths behave identically.
      prospect = prospectFromId;
    } else if (linkedinUrl) {
      prospect = await db.crmProspect.upsert({
        where: { prospect_org_linkedin_uk: { orgId, linkedinUrl } },
        create: { orgId, linkedinUrl, ...scalarFields, ...jsonFields, ...companyFields, ...icpFields },
        update: { ...scalarFields, ...jsonFields, ...companyFields, ...icpFields },
      });
    } else {
      prospect = await db.crmProspect.create({
        data: { orgId, ...scalarFields, ...jsonFields, ...companyFields, ...icpFields },
      });
    }

    // ── INCREMENTAL CONVERSATION MERGE ──────────────────────────────────────
    // The extractor re-returns the WHOLE thread on every run, so writing it
    // verbatim would double the stored history on each save. Instead the freshly
    // fetched thread is aligned against what is already stored and only the tail
    // after the overlap is appended.
    //
    // Deliberately NOT a text-based dedupe: a real thread repeats "Well" and
    // "No problem" from both participants, and each is a distinct message. The
    // merge aligns on sequence (and messageId when available), so repeated text
    // is preserved while a re-save is still a no-op. See
    // lib/services/prospects/merge-linkedin-conversation.ts.
    //
    // Runs after the prospect is resolved so both save paths (update-by-id and
    // upsert-by-URL) get identical behaviour, and reads the CURRENT stored value
    // rather than trusting the client about what was already saved.
    let conversationAppended = 0;
    let conversationTotal = 0;
    if (data.linkedinConversation !== undefined) {
      const normalised = normaliseConversation(data.linkedinConversation);
      if (normalised !== undefined) {
        const current = await db.crmProspect.findUnique({
          where: { id: prospect.id },
          select: { linkedinConversation: true },
        });
        const merged = mergeLinkedInConversation(
          current?.linkedinConversation ?? null,
          normalised as unknown as StoredConversation,
        );
        conversationAppended = merged.appendedCount;
        conversationTotal = merged.totalCount;

        // Skip the write entirely when nothing is new — avoids a pointless
        // round-trip and leaves `capturedAt` meaning "last time this actually
        // changed".
        if (merged.appendedCount > 0) {
          await db.crmProspect.update({
            where: { id: prospect.id },
            data: {
              linkedinConversation: merged.conversation as unknown as Prisma.InputJsonValue,
            },
          });
        }
        console.log(
          `[from-linkedin] conversation merge: +${merged.appendedCount} → ${merged.totalCount}` +
            ` (strategy=${merged.strategy}, prospect=${prospect.id})`,
        );

        // ── LINKEDIN CONVERSATION ACTIVITY ────────────────────────────────
        // Exactly ONE activity per prospect per calendar day, regardless of how
        // many times the conversation is saved or how many messages it holds.
        //
        // Uniqueness is enforced by the DB: externalId carries the calendar day,
        // and logActivity upserts on (orgId, sourceSystem, externalId) with
        // `update: {}`. So a re-save on the same day is a no-op, a save on the
        // next day creates a new row, and two concurrent saves cannot both
        // insert. No read-then-create race, no extra index.
        //
        // Logged whenever a conversation was sent — not only when messages were
        // appended — because "the user talked to this prospect today" is true
        // even if the thread had not moved since the last save.
        //
        // Fire-and-forget, matching the ProspectSaved call below: a logging
        // failure must never fail the save.
        // Same timezone convention as the dashboard: X-Client-TZ header, then
        // the `tz` cookie, then UTC. No new mechanism.
        const orgTz = readTzFromHeaders(request.headers);
        const activityAt = new Date();
        void ensureDefaultActivityTypes(orgId)
          .then(() =>
            logActivity({
              orgId,
              userId: extUser.userId,
              type: LINKEDIN_CONVERSATION_LABEL,
              activityCode: LINKEDIN_CONVERSATION_CODE,
              // Prospects are not a Lead/Opp/Contact/Account, so use the same
              // standalone sentinel the ProspectSaved activity uses.
              relatedKind: STANDALONE_KIND,
              relatedObjectId: STANDALONE_RELATED_ID,
              subject: `LinkedIn conversation: ${name}`,
              occurredAt: activityAt,
              sourceSystem: LINKEDIN_SOURCE_SYSTEM,
              externalId: linkedInConversationExternalId(prospect.id, activityAt, orgTz),
            }),
          )
          .catch((err: unknown) =>
            console.error("[api] from-linkedin: LinkedIn conversation activity failed", err),
          );
      }
    }

    // Log a CRM activity for the save so it counts toward the saver's activity
    // total (Activity Targets, salesperson/executive dashboards, role metrics —
    // all count CrmActivity rows by orgId + occurredAt + owner, with no type
    // whitelist, so this is picked up automatically). Idempotent on the prospect
    // id: because the prospect upsert dedupes on (orgId, linkedinUrl), re-saving
    // the same profile is a no-op here too — one activity per prospect, not per
    // save. Non-blocking: a logging failure must not fail the save.
    void logActivity({
      orgId,
      userId: extUser.userId,
      type: "ProspectSaved",
      // Standalone activity — a prospect is not a Lead/Opp/Contact/Account, so
      // use the standalone sentinel kind + id (see target-existence.ts). The
      // prospect id lives in externalId for traceability + dedupe.
      relatedKind: STANDALONE_KIND,
      relatedObjectId: STANDALONE_RELATED_ID,
      subject: `Saved prospect: ${name}`,
      occurredAt: new Date(),
      sourceSystem: "linkedin-extension",
      externalId: prospect.id,
    }).catch((err: unknown) =>
      console.error("[api] from-linkedin: logActivity failed", err),
    );

    return NextResponse.json(
      {
        success: true,
        data: { id: prospect.id },
        prospectId: prospect.id,
        // Merge outcome, so the extension can report "5 new messages saved" or
        // "No new messages to save" without re-reading the prospect.
        conversation: {
          appended: conversationAppended,
          total: conversationTotal,
        },
      },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    console.error("[api] POST /api/leads/from-linkedin", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
