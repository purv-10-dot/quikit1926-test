import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { globalSearch } from '@/lib/services/search-service';

/**
 * GET /api/search?q= — the global nav-bar type-ahead (any authenticated user).
 *
 * AUTHENTICATED, NOT ROLE-GATED — deliberate, and the same call
 * `/api/users/search` makes. Every role has something to search; what changes by
 * role is what comes BACK, and that decision lives in the service
 * (`lib/services/search-service.ts`), which scopes each section to the actor's
 * org and to the pages that actor can actually open. Putting a `requireRoles`
 * here would only pick one role list to be wrong for.
 */
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const q = new URL(req.url).searchParams.get('q') ?? '';
  return json({ success: true, data: await globalSearch(actor, q) });
});
