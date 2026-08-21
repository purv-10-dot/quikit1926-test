import { type NextRequest } from "next/server";
import { isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  resolveUpworkUser,
  upworkOwnerScope,
} from "@/lib/services/upwork/resolve-upwork-user";
import { listUpworkJobs } from "@/lib/services/upwork/upwork-service";
import { ok, failFromError } from "@/lib/services/icp/responses";

export const runtime = "nodejs";

/**
 * GET /api/upwork/picker?q=&limit=
 * Returns: { success, data: { items: [{ id, name }] } }
 *
 * Lightweight dropdown source for the Upwork picker in the Log Activity
 * composer. Deliberately delegates to `listUpworkJobs` + `upworkOwnerScope`
 * rather than querying CrmUpworkJob directly, so the picker inherits the
 * module's existing rules for free and cannot drift from the Upwork list:
 *   - non-admins only see jobs they added (`createdByUserId`)
 *   - trashed jobs (`deletedAt`) are excluded
 *
 * `jobTitle` is mapped to `name` so the response matches the shape every other
 * picker returns, which is what the composer's shared option mapper expects.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);

    const user = await resolveUpworkUser(req, searchParams.get("orgId") ?? undefined);
    if (isResponse(user)) return user;
    await assertModule(user, "upwork", "view");

    const q = searchParams.get("q")?.trim() || undefined;
    const pageSize = Math.min(
      Math.max(parseInt(searchParams.get("limit") ?? "25", 10) || 25, 1),
      100,
    );

    const result = await listUpworkJobs({
      orgId: user.orgId,
      ownerUserId: upworkOwnerScope(user),
      q,
      page: 1,
      pageSize,
      trashed: false,
      // Newest first — the job a user wants to log against is almost always one
      // they just added.
      sortBy: "createdAt",
      sortDir: "desc",
    });

    const items = result.items.map((job) => ({ id: job.id, name: job.jobTitle }));
    return ok({ items });
  } catch (error: unknown) {
    return failFromError(error, "api/upwork/picker GET", "Failed to load Upwork jobs");
  }
}
