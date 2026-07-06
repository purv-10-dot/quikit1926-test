import { z } from 'zod';
import { route, json, BadRequest } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { findQuestion, updateQuestion, softDeleteQuestion } from '@/lib/services/question-bank-service';

const ROLES = ['TENANT_ADMIN', 'SUB_ADMIN', 'TEACHER'] as const;

// GET /api/question-bank/:id
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, [...ROLES]);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const data = await findQuestion(actor.tenantId, params!.id);
  return json({ success: true, data });
});

// PUT /api/question-bank/:id
export const PUT = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, [...ROLES]);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  const body = await parseBody(req, z.object({}).passthrough());
  const data = await updateQuestion(actor.tenantId, params!.id, body as Record<string, unknown>);
  return json({ success: true, data });
});

// DELETE /api/question-bank/:id
export const DELETE = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, [...ROLES]);
  if (!actor.tenantId) throw BadRequest('Tenant ID required');
  await softDeleteQuestion(actor.tenantId, params!.id);
  return json({ success: true, message: 'Question deactivated' });
});
