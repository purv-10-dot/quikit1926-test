import { z } from 'zod';
import { route, json } from '@/lib/http';
import { parseBody } from '@/lib/validation';
import { requireAuth, requireRoles, assertTenantMatch } from '@/lib/auth/context';
import { db } from '@/lib/db';
import { findTenant } from '@/lib/services/tenants-service';

/**
 * The legacy body was an inline TS interface (`tenants.controller.ts:409`), which
 * has no runtime metatype — so Nest's ValidationPipe never ran on it and this
 * endpoint had NO validation at all. zod is therefore stricter here than the
 * original. Deliberately non-strict (strip, not reject) to stay as close to the
 * old "anything goes" behavior as the app's conventions allow.
 */
const schema = z.object({
  defaultLanguage: z.string().optional(),
  enabledLanguages: z.array(z.string()).optional(),
});

/**
 * PATCH /api/tenants/:id/language-config — ADMIN | TENANT_ADMIN | SUB_ADMIN
 *
 * Port of `TenantsController.updateLanguageConfig` (`tenants.controller.ts:407-422`).
 * Previously had no route file at all, while `GET /api/tenants/current` already
 * returned `defaultLanguage`/`enabledLanguages` — so the UI surfaced two values
 * that could never be written.
 *
 * Falsy-guard semantics are the legacy ones, asymmetry included: the original
 * used `if (body.defaultLanguage)` / `if (body.enabledLanguages)`, NOT
 * `!== undefined`. So `defaultLanguage: ''` is falsy and silently dropped — the
 * default language can never be cleared — while `enabledLanguages: []` IS truthy
 * and does clear the list. Reproduced exactly.
 *
 * `assertTenantMatch` is this app's convention on every tenant-scoped `:id` route
 * (cf. the sibling `branding` and `video-config` routes). The original had none,
 * so a TENANT_ADMIN of one tenant could rewrite another's language config.
 */
export const PATCH = route(async (req, { params }) => {
  const actor = await requireAuth(req);
  requireRoles(actor, ['TENANT_ADMIN', 'SUB_ADMIN', 'ADMIN']);
  assertTenantMatch(actor, params!.id);

  await findTenant(params!.id);
  const dto = await parseBody(req, schema);

  const data: Record<string, unknown> = {};
  if (dto.defaultLanguage) data.defaultLanguage = dto.defaultLanguage;
  if (dto.enabledLanguages) data.enabledLanguages = dto.enabledLanguages;

  const tenant = await db.lmsTenant.update({ where: { id: params!.id }, data });

  return json({
    success: true,
    data: {
      defaultLanguage: tenant.defaultLanguage,
      enabledLanguages: tenant.enabledLanguages,
    },
    message: 'Language config updated',
  });
});
