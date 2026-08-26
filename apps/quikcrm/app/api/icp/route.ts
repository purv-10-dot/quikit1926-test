/**
 * GET  /api/icp  — list ICP profiles (paginated, searchable, filterable)
 * POST /api/icp  — create an ICP profile
 *
 * Auth/permission pattern cloned from /api/price-lists: requireApiUser →
 * assertModule → validate → org-scoped service call.
 */

import { type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  createIcpProfileSchema,
  listIcpProfilesQuerySchema,
} from "@/lib/validators/icp";
import { createIcpProfile, listIcpProfiles } from "@/lib/services/icp/icp-service";
import { ok, fail, failFromError, zodFieldErrors } from "@/lib/services/icp/responses";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "icp", "view");

    const { searchParams } = new URL(req.url);
    const parsed = listIcpProfilesQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return fail(
        400,
        "Invalid query: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }

    const result = await listIcpProfiles({ orgId: user.orgId, ...parsed.data });
    return ok(result);
  } catch (error: unknown) {
    return failFromError(error, "api/icp GET", "Failed to list ICP profiles");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "icp", "create");

    const body = await req.json().catch(() => null);
    const parsed = createIcpProfileSchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, "Validation failed", zodFieldErrors(parsed.error));
    }

    try {
      const created = await createIcpProfile({
        orgId: user.orgId,
        userId: user.userId,
        input: parsed.data,
      });
      return ok(created, { status: 201 });
    } catch (e: unknown) {
      if ((e as { code?: string }).code === "P2002") {
        return fail(409, "An ICP profile with this name already exists.", {
          name: "Duplicate name",
        });
      }
      throw e;
    }
  } catch (error: unknown) {
    return failFromError(error, "api/icp POST", "Failed to create ICP profile");
  }
}
