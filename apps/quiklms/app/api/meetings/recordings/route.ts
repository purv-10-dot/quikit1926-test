import { route, json } from '@/lib/http';
import { requireAuth } from '@/lib/auth/context';
import { getAllRecordings } from '@/lib/services/meetings-service';

// GET /api/meetings/recordings?status=&limit= — any authenticated user
export const GET = route(async (req) => {
  const actor = await requireAuth(req);
  const url = new URL(req.url);
  const status = url.searchParams.get('status') || undefined;
  const limit = url.searchParams.get('limit');
  return json(await getAllRecordings(actor.orgId!, { status, limit: limit ? parseInt(limit) : undefined }));
});
