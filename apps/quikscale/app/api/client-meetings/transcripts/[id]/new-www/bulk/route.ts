import { withOrgAuthForResource } from "@/lib/api/withOrgAuth";
import { handleWwwExport } from "@/lib/api/wwwExportHandler";

export const runtime = "nodejs";

const auth = withOrgAuthForResource("clientMeetings.dashboard", "ClientMeetings.Report");

/**
 * POST /api/client-meetings/transcripts/[id]/new-www/bulk
 *
 * **Export WWW** for a single meeting. Same guarantees as the week-level route
 * — see `lib/api/wwwExportHandler.ts` — scoped to this transcript, so a
 * candidate belonging to another meeting is refused rather than created.
 */
export const POST = auth.update<{ id: string }>(
  async ({ orgId, userId }, req, { params }) =>
    handleWwwExport({ orgId, userId, req, scope: { transcriptId: params.id } }),
  { fallbackErrorMessage: "Failed to export the selected WWW items" },
);
