import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles } from '@/lib/auth/context';
import { getTemplateWithDefaults, saveTemplate } from '@/lib/services/email-templates-service';

// GET /api/email-templates/:type — ADMIN
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN']);
  const data = await getTemplateWithDefaults(params!.type);
  return json({ success: true, data });
});

const saveSchema = z.object({ subject: z.string(), htmlContent: z.string() });

// POST /api/email-templates/:type — ADMIN
export const POST = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['ADMIN']);
  const body = await parseBody(req, saveSchema);
  const data = await saveTemplate(params!.type, body.subject, body.htmlContent);
  return json({ success: true, data, message: 'Email template saved successfully' });
});
