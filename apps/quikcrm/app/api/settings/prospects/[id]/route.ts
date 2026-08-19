/**
 * PATCH /api/settings/prospects/[id] — edit a prospect from the CRM UI.
 *
 * Counterpart to POST /api/prospects (create). Same field set minus the origin
 * reference: `upworkJobId` is immutable here, so editing a prospect can never
 * re-point or break the 1:1 Upwork job link, and the job row is never touched.
 *
 * Authorization mirrors the convert route exactly — `prospectScopeWhere` for the
 * lookup, so a non-admin can only edit prospects they personally saved, and an
 * out-of-scope row is a 404 rather than a 403 (a user who cannot see the row
 * must not learn that it exists).
 *
 * Converted prospects stay editable: the linked lead owns the pipeline data, but
 * fixing a typo or a wrong ICP on the original capture is still legitimate.
 */

import { NextResponse, type NextRequest } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { prospectScopeWhere } from "@/lib/auth/prospect-acl";
import { updateProspectSchema } from "@/lib/validators/prospect";

export const runtime = "nodejs";

function fail(status: number, error: string, fieldErrors?: Record<string, string>) {
  return NextResponse.json(
    { success: false, error, ...(fieldErrors ? { fieldErrors } : {}) },
    { status },
  );
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    // Prospects live under the Leads module in this app's navigation, matching
    // the permission the create endpoint and the Prospects screen use.
    await assertModule(user, "leads", "edit");

    const parsed = updateProspectSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const fieldErrors: Record<string, string> = {};
      for (const [k, v] of Object.entries(flat.fieldErrors)) {
        if (v?.length) fieldErrors[k] = v[0]!;
      }
      return fail(400, flat.formErrors[0] ?? "Validation failed", fieldErrors);
    }
    const input = parsed.data;

    const prospect = await prisma.crmProspect.findFirst({
      where: { id, ...prospectScopeWhere(user) },
      select: { id: true },
    });
    if (!prospect) return fail(404, "Prospect not found");

    // ICP is a reference — verify it exists in the caller's org before storing
    // the id, so a stale or foreign id can never be persisted.
    if (input.icpId) {
      const icp = await prisma.crmIcpProfile.findFirst({
        where: { id: input.icpId, orgId: user.orgId },
        select: { id: true },
      });
      if (!icp) return fail(400, "Selected ICP was not found", { icpId: "Unknown ICP" });
    }

    // Only the keys the client actually sent are written, so an omitted field
    // keeps its current value instead of being nulled out.
    const data: Prisma.CrmProspectUpdateInput = {};
    if ("name" in input && input.name !== undefined) data.name = input.name;
    if ("email" in input) data.email = input.email ?? null;
    if ("phone" in input) data.phone = input.phone ?? null;
    if ("title" in input) data.title = input.title ?? null;
    if ("company" in input) data.company = input.company ?? null;
    if ("shortSummary" in input) data.shortSummary = input.shortSummary ?? null;
    if ("linkedinUrl" in input) data.linkedinUrl = input.linkedinUrl ?? null;
    if ("icpId" in input) {
      data.icp = input.icpId ? { connect: { id: input.icpId } } : { disconnect: true };
    }

    try {
      const updated = await prisma.crmProspect.update({
        where: { id: prospect.id },
        data,
        select: {
          id: true,
          name: true,
          email: true,
          phone: true,
          title: true,
          company: true,
          linkedinUrl: true,
          shortSummary: true,
          icpId: true,
          icp: { select: { id: true, name: true, isActive: true } },
        },
      });
      return NextResponse.json({ success: true, data: updated });
    } catch (e: unknown) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        if (String(e.meta?.target ?? "").includes("linkedin")) {
          return fail(409, "A prospect with this LinkedIn URL already exists.", {
            linkedinUrl: "Already used by another prospect",
          });
        }
      }
      throw e;
    }
  } catch (e) {
    return errorResponse(e);
  }
}
