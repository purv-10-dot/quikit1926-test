import { route, ApiError } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';

/**
 * POST /api/auth/change-password
 *
 * Under centralized auth, passwords are owned by the QuikIT auth server — a
 * QuikLMS SSO session holds no usable local password, so it cannot change one
 * here. We return a clean, actionable error (instead of the NextAuth catch-all's
 * unparseable text response) pointing the user at central account settings.
 *
 * Static route → takes precedence over app/api/auth/[...nextauth].
 */
export const POST = route(async (req) => {
  await requireAuth(req);
  const authUrl = process.env.NEXT_PUBLIC_AUTH_URL ?? '';
  throw new ApiError(
    400,
    `Password changes are managed by central sign-in${authUrl ? ` (${authUrl})` : ''}. ` +
      `Please update your password from your QuikIT account settings.`,
    'Bad Request',
  );
});
