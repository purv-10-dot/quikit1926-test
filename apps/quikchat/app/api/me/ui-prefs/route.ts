import { HttpError, withOrgAuth } from "@/lib/auth-shims";
import { readJson } from "@/lib/server/helpers";
import { getUiPrefs, isThemePref, setUiPrefs } from "@/lib/server/ui-prefs.service";

export const dynamic = "force-dynamic";

export const GET = withOrgAuth(async (_req, ctx) => {
  return Response.json(await getUiPrefs(ctx));
});

/** PATCH /api/me/ui-prefs { theme } — system | light | dark. */
export const PATCH = withOrgAuth(async (req, ctx) => {
  const body = await readJson(req);
  if (body.theme !== undefined && !isThemePref(body.theme)) {
    throw new HttpError(400, "theme must be system|light|dark");
  }
  return Response.json(await setUiPrefs(ctx, { theme: body.theme as never }));
});
