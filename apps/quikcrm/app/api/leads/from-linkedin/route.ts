import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import type { Prisma } from "@quikit/database";
import { z } from "zod";
import { db } from "@/lib/db";
import { verifyExtensionToken } from "@/lib/auth/extension-token";
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

const fromLinkedinSchema = z.object({
  orgId: z.string().min(1).optional(),
  name: z.string().trim().optional(),
  email: z.string().trim().optional(),
  phone: z.string().trim().optional(),
  title: z.string().trim().optional(),
  company: z.string().trim().optional(),
  linkedinUrl: z.string().trim().optional(),
  shortSummary: z.string().trim().optional(),
  about: z.string().trim().optional(),
  profilePicture: z.string().trim().optional(),
  posts: jsonValue.optional(),
  companyData: jsonValue.optional(),
  experiences: jsonValue.optional(),
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

    // Upsert on (orgId, linkedinUrl) when we have a URL; otherwise always create
    // (URL-less captures can't be deduped and Postgres treats NULLs as distinct).
    let prospect;
    if (linkedinUrl) {
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
      { success: true, data: { id: prospect.id }, prospectId: prospect.id },
      { status: 201 },
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Operation failed";
    console.error("[api] POST /api/leads/from-linkedin", error);
    return NextResponse.json({ success: false, error: message }, { status: 500 });
  }
}
