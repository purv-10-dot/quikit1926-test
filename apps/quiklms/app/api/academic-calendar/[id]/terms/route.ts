import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth } from '@/lib/auth/context';
import { updateTerms } from '@/lib/services/academic-calendar-service';

const termSchema = z.object({
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  isActive: z.boolean().optional(),
});
const schema = z.object({ terms: z.array(termSchema) });

// PATCH /api/academic-calendar/:id/terms — any authenticated user
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const { terms } = await parseBody(req, schema);
  return json(await updateTerms(actor.tenantId, params!.id, terms));
});
