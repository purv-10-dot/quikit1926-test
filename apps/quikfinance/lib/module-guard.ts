import { fail } from "@/lib/api/responses";
import type { ApiContext } from "@/lib/api/auth";
import { MODULE_KEYS } from "@/lib/general-modules";

/**
 * Server-side enforcement of the Setup & Configurations → General module toggles.
 * The sidebar hides disabled modules, but that is cosmetic — this guard makes the
 * toggle real by rejecting writes to a disabled module's API. Returns a 403
 * response to short-circuit with `if (blocked) return blocked;`, or null.
 */
export async function assertModuleEnabled(context: ApiContext, moduleKey: string) {
  if (!MODULE_KEYS.includes(moduleKey)) return null; // core modules are always on
  const rows = (await context.prisma.$queryRaw`
    SELECT general_settings FROM organizations WHERE id = ${context.orgId}::uuid LIMIT 1
  `) as Array<{ general_settings: { disabled_modules?: string[] } | null }>;
  const disabled = rows[0]?.general_settings?.disabled_modules ?? [];
  if (Array.isArray(disabled) && disabled.includes(moduleKey)) {
    return fail(403, { code: "MODULE_DISABLED", message: "This module is turned off. Enable it in Settings → General to continue." });
  }
  return null;
}
