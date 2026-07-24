import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { addStudents } from '@/lib/services/batches-service';

const schema = z.object({ studentIds: z.array(z.string()) });

// POST /api/batches/:id/students — TENANT_ADMIN | SUB_ADMIN | TEACHER
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER']);
  const dto = await parseBody(req, schema);
  return json(await addStudents(actor.orgId!, params!.id, dto));
});
