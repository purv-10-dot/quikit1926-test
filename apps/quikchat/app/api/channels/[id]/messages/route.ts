import { withOrgAuth } from "@/lib/auth-shims";
import type { SendMessageInput } from "@/lib/shared";
import { readJson } from "@/lib/server/helpers";
import * as messages from "@/lib/server/messages.service";
import { RATE } from "@/lib/server/rate-limits";

export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (req, ctx, params) => {
  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam, 10) : 30;
  const before = url.searchParams.get("before") ?? undefined;
  return Response.json(
    await messages.list(ctx, params.id!, Number.isFinite(limit) ? limit : 30, before),
  );
});

export const POST = withOrgAuth(
  async (req, ctx, params) => {
    const body = (await readJson(req)) as unknown as SendMessageInput;
    return Response.json(await messages.send(ctx, params.id!, body));
  },
  { rateLimit: RATE.send },
);
