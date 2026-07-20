import { withOrgAuth } from "@/lib/auth-shims";
import { listOrgUsers } from "@/lib/server/users.service";

export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (req, ctx) => {
  const url = new URL(req.url);
  const q = url.searchParams.get("q") ?? undefined;
  const excludeChannelId = url.searchParams.get("excludeChannelId") ?? undefined;
  const excludeSelf = url.searchParams.get("excludeSelf") === "1";
  return Response.json(await listOrgUsers(ctx, { q, excludeChannelId, excludeSelf }));
});
