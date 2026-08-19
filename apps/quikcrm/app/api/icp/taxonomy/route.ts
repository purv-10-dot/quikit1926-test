/**
 * GET  /api/icp/taxonomy — list the Industry/Vertical/Technology master
 * POST /api/icp/taxonomy — create a master entry
 *
 * The master is org-level config, so writes require `icp.create` / `icp.edit`
 * exactly like the profiles themselves — there is no separate settings module
 * key. Reads only need `icp.view` so the ICP form's pickers work for every user
 * who can see ICPs at all.
 */

import { type NextRequest } from "next/server";
import { requireApiUser, isResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  createIcpTaxonomySchema,
  listIcpTaxonomyQuerySchema,
} from "@/lib/validators/icp";
import { createIcpTaxonomy, listIcpTaxonomy } from "@/lib/services/icp/icp-taxonomy-service";
import { ok, fail, failFromError, zodFieldErrors } from "@/lib/services/icp/responses";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "icp", "view");

    const { searchParams } = new URL(req.url);
    const parsed = listIcpTaxonomyQuerySchema.safeParse(Object.fromEntries(searchParams));
    if (!parsed.success) {
      return fail(
        400,
        "Invalid query: " +
          parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "),
      );
    }

    const result = await listIcpTaxonomy({ orgId: user.orgId, ...parsed.data });
    return ok(result);
  } catch (error: unknown) {
    return failFromError(error, "api/icp/taxonomy GET", "Failed to list ICP taxonomy");
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "icp", "create");

    const body = await req.json().catch(() => null);
    const parsed = createIcpTaxonomySchema.safeParse(body);
    if (!parsed.success) {
      return fail(400, "Validation failed", zodFieldErrors(parsed.error));
    }

    const created = await createIcpTaxonomy({ orgId: user.orgId, input: parsed.data });
    return ok(created, { status: 201 });
  } catch (error: unknown) {
    return failFromError(error, "api/icp/taxonomy POST", "Failed to create taxonomy entry");
  }
}
