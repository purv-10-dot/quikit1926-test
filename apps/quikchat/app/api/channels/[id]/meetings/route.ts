import { withOrgAuth } from "@/lib/auth-shims";
import type { CreateMeetingInput } from "@/lib/shared";
import { readJson } from "@/lib/server/helpers";
import * as calendar from "@/lib/server/calendar.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

// POST /api/channels/[id]/meetings — schedule a meeting + post its card.
export const POST = withOrgAuth(
  async (req, ctx, params) => {
    const body = (await readJson(req)) as unknown as CreateMeetingInput;
    return Response.json(await calendar.createMeeting(ctx, params.id!, body));
  },
  { rateLimit: RATE.meetingCreate },
);
