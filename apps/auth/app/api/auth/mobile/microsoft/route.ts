/**
 * POST /api/auth/mobile/microsoft
 *
 * Scaffold only — native Microsoft MSAL login is NOT implemented. The
 * current mobile scope is Android + Google only; Microsoft's native MSAL
 * app registration hasn't been supplied yet (see the implementation guide's
 * "Information Required from Mobile Team" section). This route exists purely
 * to reserve the contract shape and fail loudly with a 501 instead of a 404,
 * so the mobile client's error handling can be built against it now.
 *
 * To complete this endpoint once MSAL config is available, mirror
 * `../google/route.ts`:
 *   1. Verify the MSAL id_token/access_token against Microsoft's JWKS,
 *      audienced to the native (public-client) Azure AD app registration —
 *      note this is very likely a SEPARATE app registration from the
 *      existing web `MICROSOFT_CLIENT_ID` (confidential client), since
 *      native MSAL flows require a public client registration.
 *   2. Call `resolveOAuthIdentity({ provider: "azure-ad", ... })` from
 *      `@quikit/auth/mobile` — same identity/invite-acceptance logic web
 *      Microsoft login already uses.
 *   3. `createAuthSession` + `resolveOrgContext` + `mintHandoffToken`,
 *      exactly as the Google route does.
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { z } from "zod";

const BodySchema = z.object({
  idToken: z.string().min(1),
  targetOrigin: z.string().url(),
  to: z.string().optional(),
});

export async function POST(req: NextRequest) {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json(
      { success: false, error: "Body must be JSON" },
      { status: 400 },
    );
  }
  const parsed = BodySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      {
        success: false,
        error: parsed.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; "),
      },
      { status: 400 },
    );
  }

  return NextResponse.json(
    {
      success: false,
      error:
        "Native Microsoft login not yet configured — pending MSAL client/tenant config",
    },
    { status: 501 },
  );
}
