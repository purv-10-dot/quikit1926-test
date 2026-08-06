/**
 * Super-admin attachment viewer.
 *
 * The tenant-facing viewer in each app (`/api/support/uploads/view/<key>`)
 * refuses any key whose org segment isn't the caller's — correct there, useless
 * here: triage exists precisely to read a screenshot raised by some other org.
 *
 * So this is a SEPARATE route with a different gate. `withSuperAdminAuth` is
 * the boundary, and `orgId: null` tells the shared resolver to skip the
 * per-tenant prefix check. It still refuses anything that isn't under the
 * `support/` prefix, so it can never be pointed at another feature's objects.
 *
 * Cross-org reads are a sanctioned super-admin surface, same as the ticket
 * queue itself — see docs/04-db-patterns.md. Every hit is a super-admin acting
 * on a ticket they already have open.
 */

import { NextResponse } from "next/server";
import { withSuperAdminAuth } from "@/lib/withSuperAdminAuth";
import { handleSupportAttachmentView } from "@quikit/shared/supportAttachments";

export const GET = withSuperAdminAuth<{ key: string[] }>(
  async (_auth, _req, { params }) => {
    try {
      const result = await handleSupportAttachmentView({
        orgId: null,
        keySegments: params.key ?? [],
      });
      if (!result.ok) {
        return NextResponse.json(
          { success: false, error: result.error },
          { status: result.status },
        );
      }
      return NextResponse.redirect(result.data);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Failed to open attachment";
      return NextResponse.json({ success: false, error: message }, { status: 500 });
    }
  },
);
