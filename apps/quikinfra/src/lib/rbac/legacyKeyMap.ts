/**
 * Legacy permission key → v2 (resource, action) mapping.
 *
 * The pre-v2 permission keys used in `requirePermission("boq.lock")` etc.
 * are a flat namespace (`<domain>.<verb>`) that doesn't match the v2
 * tree's `construction.<domain>` + action shape. This file is the lookup
 * routes use during migration:
 *
 *   // before
 *   const ctx = await requirePermission("boq.lock");
 *   if (ctx instanceof NextResponse) return ctx;
 *
 *   // after
 *   const auth = withOrgAuthForResource("construction.boq");
 *   export const POST = auth.lock(async ({ orgId, userId }, req) => { ... });
 *
 * If you find yourself needing a key that isn't here, you're migrating a
 * route whose permission was never grant-able from the v2 seeder. Add it
 * to permissionsRegistry.ts + seedDefaultRoles.ts FIRST, then add the
 * mapping here so the conversion stays mechanical.
 *
 * Decision notes:
 *   - `boq.write` is ambiguous (could mean create OR edit). We pick `edit`
 *     because the only two callers (`POST /boq/[itemId]` and `PATCH /boq`)
 *     are both updating existing items, not creating new ones. Routes that
 *     create new BOQ entries already use the `boq.import` flow.
 *   - `boq.unlock` shares the same authority as `boq.lock` — there's no
 *     separate "unlock" action because anyone who can lock can also unlock
 *     (otherwise BOQs would get stranded).
 *   - `boq.read` is the bare list endpoint; it has no row-level scope so
 *     `view` is correct.
 */

import { isValidPermissionPair } from "./permissionsRegistry";

export interface LegacyMapping {
  resource: string;
  action: string;
}

export const LEGACY_KEY_MAP: Readonly<Record<string, LegacyMapping>> = {
  "boq.read":     { resource: "construction.boq",     action: "view"   },
  "boq.write":    { resource: "construction.boq",     action: "edit"   },
  "boq.import":   { resource: "construction.boq",     action: "import" },
  "boq.lock":     { resource: "construction.boq",     action: "lock"   },
  "boq.unlock":   { resource: "construction.boq",     action: "lock"   },
  "wbs.read":     { resource: "construction.wbs",     action: "view"   },
  "wbs.write":    { resource: "construction.wbs",     action: "edit"   },
  "finance.view": { resource: "construction.finance", action: "view"   },
  "rab.approve":  { resource: "construction.rab",     action: "approve"},
};

export function lookupLegacyKey(legacyKey: string): LegacyMapping | null {
  return LEGACY_KEY_MAP[legacyKey] ?? null;
}

/**
 * Dev-time check that every mapped pair actually exists in the v2 tree.
 * Called once at module load — fails loudly so a typo in this file
 * surfaces before a request hits a phantom resource.
 */
function assertLegacyMapIsValid(): void {
  for (const [legacyKey, mapping] of Object.entries(LEGACY_KEY_MAP)) {
    if (!isValidPermissionPair(mapping.resource, mapping.action)) {
      throw new Error(
        `LEGACY_KEY_MAP entry "${legacyKey}" → (${mapping.resource}, ${mapping.action}) ` +
          `does not exist in permissionsRegistry. Add it to PERMISSION_TREE first.`,
      );
    }
  }
}

assertLegacyMapIsValid();
