import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles, assertTenantMatch } from '@/lib/auth/context';
import { prisma } from '@/lib/prisma';
import { findTenant } from '@/lib/services/tenants-service';

/**
 * GET /api/tenants/:id/video-config — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * Port of `TenantsController.getVideoConfig` (`tenants.controller.ts:375-380`).
 *
 * Returns provider credentials (apiKey / apiSecret / clientSecret / refreshToken
 * / jwtSecret) UNREDACTED. That is faithful — the original returned
 * `tenant.videoConfig` raw too. It is a reproduced flaw, not a migration
 * regression, so it is preserved rather than "fixed" here. Note the schema
 * comment on `LmsTenant.videoConfig` claims the column is "encrypted at rest
 * (lib/crypto)" — nothing encrypts or decrypts it on either side. See the
 * QUESTION in the migration summary.
 */
export const GET = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN']);
  assertTenantMatch(actor, params!.id);

  const tenant = await findTenant(params!.id);
  return json({ success: true, data: tenant.videoConfig ?? {} });
});

/**
 * PATCH /api/tenants/:id/video-config — SUPER_ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * Port of `TenantsController.updateVideoConfig` (`tenants.controller.ts:364-373`).
 *
 * MERGES into the existing config — `{ ...existing, ...body }`, exactly as the
 * original did. Mongo let the legacy code mutate one JSON field in place; Prisma
 * writes the whole column, so a naive `data: { videoConfig: dto }` DESTROYS every
 * key the request omitted. That is what this route used to do: `PATCH
 * {provider:'zoom'}` silently wiped the stored `credentials`.
 *
 * The merge is SHALLOW, matching the legacy spread — a nested object in the body
 * replaces its counterpart wholesale rather than merging key-by-key.
 *
 * `.passthrough()` is correct here: the legacy body was `@Body() body: any`, so
 * it had no runtime metatype and ValidationPipe never ran. Unknown keys were
 * accepted and stored. The write is scoped to the `videoConfig` column, so this
 * is not a mass-assignment vector — unlike `PATCH /tenants/:id`.
 */

/**
 * F-003: this was `z.object({}).passthrough()`, which declared nothing.
 *
 * `.passthrough()` is KEPT — see the note above. The body is a provider-config
 * blob written verbatim into one `Json` column and merged with what is already
 * stored, so there is no fixed key set: new providers add new keys, and the
 * legacy endpoint accepted `any`. Rejecting unknown keys here would break the
 * next provider integration for no security benefit.
 *
 * What the empty schema could NOT do, and this one does: reject a body whose
 * KNOWN keys have the wrong *shape* — `{provider: 42}` or `{zoom: "oops"}`
 * would previously be merged into the column and then read back by the meetings
 * integration as a malformed config. Nothing is required, because a partial
 * PATCH of a single section is the normal case for this screen.
 */
const videoConfigSchema = z.object({
  provider: z.string().optional(),
  zoom: z.record(z.unknown()).optional(),
  googleMeet: z.record(z.unknown()).optional(),
  jitsi: z.record(z.unknown()).optional(),
  meetingSettings: z.record(z.unknown()).optional(),
  credentials: z.record(z.unknown()).optional(),
}).passthrough();

export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'SUPER_ADMIN']);
  assertTenantMatch(actor, params!.id);

  const existingTenant = await findTenant(params!.id);
  const dto = await parseBody(req, videoConfigSchema);

  const existing = (existingTenant.videoConfig ?? {}) as Record<string, unknown>;
  const updated = { ...existing, ...(dto as Record<string, unknown>) };

  const tenant = await prisma.lmsTenant.update({
    where: { id: params!.id },
    data: { videoConfig: updated as object },
  });
  // Message string is the legacy one verbatim (`tenants.controller.ts:372`).
  return json({ success: true, data: tenant.videoConfig ?? {}, message: 'Video config updated' });
});
