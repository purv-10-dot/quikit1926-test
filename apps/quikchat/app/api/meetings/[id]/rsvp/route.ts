import { withOrgAuth } from "@/lib/auth-shims";
import type { RsvpInput } from "@/lib/shared";
import { readJson } from "@/lib/server/helpers";
import * as calendar from "@/lib/server/calendar.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

// PATCH /api/meetings/[id]/rsvp — set the caller's RSVP; live-refreshes the card.
export const PATCH = withOrgAuth(
  async (req, ctx, params) => {
    const body = (await readJson(req)) as unknown as RsvpInput;
    return Response.json(await calendar.setRsvp(ctx, params.id!, body.status));
  },
  { rateLimit: RATE.rsvp },
);
