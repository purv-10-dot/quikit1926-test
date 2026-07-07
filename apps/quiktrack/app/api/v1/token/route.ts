import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { db } from "@/lib/db";
import { getOrgId } from "@/lib/api/getOrgId";
import { signApiToken, API_TOKEN_TTL_SECONDS } from "@/lib/api/apiToken";
import { rateLimit, clientIpFromHeaders } from "@/lib/api/rateLimit";

/**
 * POST /api/v1/token — exchange email + password for a short-lived Bearer
 * token used by external Swagger/Scalar consumers and API scripts.
 *
 * This is the ONE unauthenticated endpoint in the v1 surface: it *is* the
 * login. Every other endpoint requires the `Authorization: Bearer <token>`
 * this returns. The token is scoped to the user's currently-active org and
 * expires after API_TOKEN_TTL_SECONDS; re-post credentials to renew.
 *
 * Auth model mirrors the shared credentials provider (packages/auth): a
 * case-insensitive user lookup + bcrypt password compare against db.user.
 * We replicate rather than import it because that logic lives inside NextAuth's
 * `authorize` callback and isn't exported standalone — and this keeps the whole
 * feature inside apps/quiktrack.
 */

// Uniform delay-free error — never reveals whether the email exists.
const INVALID = { error: "invalid_credentials", message: "Invalid email or password" };

const bodySchema = z.object({
  email: z.string().trim().min(1).email(),
  password: z.string().min(1),
});

// Brute-force guards: the credentials provider no longer throttles, so we do
// it here. Per-IP catches stuffing from one source; per-email caps attempts
// against a single account across sources.
const IP_LIMIT = 20;
const EMAIL_LIMIT = 10;
const WINDOW_SECONDS = 15 * 60;

export async function POST(req: NextRequest): Promise<NextResponse> {
  let parsed: z.infer<typeof bodySchema>;
  try {
    const json = await req.json();
    const result = bodySchema.safeParse(json);
    if (!result.success) {
      return NextResponse.json(
        { error: "invalid_request", message: "email and password are required" },
        { status: 400 },
      );
    }
    parsed = result.data;
  } catch {
    return NextResponse.json(
      { error: "invalid_request", message: "Request body must be JSON" },
      { status: 400 },
    );
  }

  const email = parsed.email.toLowerCase();
  const ip = clientIpFromHeaders(req.headers);

  const [ipCheck, emailCheck] = await Promise.all([
    rateLimit(`token:ip:${ip}`, IP_LIMIT, WINDOW_SECONDS),
    rateLimit(`token:email:${email}`, EMAIL_LIMIT, WINDOW_SECONDS),
  ]);
  const limited = !ipCheck.allowed ? ipCheck : !emailCheck.allowed ? emailCheck : null;
  if (limited) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many attempts. Try again later." },
      { status: 429, headers: { "Retry-After": String(limited.retryAfter) } },
    );
  }

  // Case-insensitive lookup so historical mixed-case emails still match.
  const user = await db.user.findFirst({
    where: { email: { equals: email, mode: "insensitive" } },
    select: { id: true, email: true, password: true },
  });

  // Compare against a real hash whether or not the user exists, so response
  // timing doesn't leak account existence.
  const hash = user?.password ?? "$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinva";
  const passwordOk = await bcrypt.compare(parsed.password, hash);
  if (!user || !user.password || !passwordOk) {
    return NextResponse.json(INVALID, { status: 401 });
  }

  // Resolve the org the token will be scoped to. No active membership → the
  // account can't do anything through the API, so reject up-front.
  const orgId = await getOrgId(user.id);
  if (!orgId) {
    return NextResponse.json(
      { error: "no_membership", message: "No active organization membership" },
      { status: 403 },
    );
  }

  const accessToken = await signApiToken({ userId: user.id, orgId, email: user.email });

  return NextResponse.json({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: API_TOKEN_TTL_SECONDS,
  });
}
