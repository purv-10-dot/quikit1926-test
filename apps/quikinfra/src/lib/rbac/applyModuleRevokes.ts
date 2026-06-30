/**
 * Translates the Add/Edit User form's "modules ticked" list into v2
 * permission revokes on `CnUserPermissionExtra`.
 *
 * The model:
 *   - The full universe of "module-managed" permissions is the union of
 *     `MODULE_TO_RESOURCES` values.
 *   - Pairs that fall in TICKED modules → must NOT have a revoke row.
 *   - Pairs that fall in UNTICKED modules → must have `revoke = true`.
 *
 * Idempotent. Safe to call on every Add or Edit — the helper reconciles
 * the table to match the supplied tick list. Settings-tier permissions
 * (construction.users.manage, etc.) are NOT in any module's resource
 * list, so this helper never touches them — they stay governed by the
 * existing "Grant Settings access" extras flow.
 *
 * Phase 4 wiring. Once `cn_users.modulesAssigned` is dropped, this is
 * the single source of truth for module-level scoping.
 */

import {
  ALL_MODULE_KEYS,
  MODULE_TO_RESOURCES,
  modulePermissionPairs,
  type Action,
} from "./permissionsRegistry";

interface PermExtraDelegate {
  upsert: (args: unknown) => Promise<unknown>;
  deleteMany: (args: unknown) => Promise<{ count: number }>;
}

interface DbCentralLike {
  cnUserPermissionExtra: PermExtraDelegate;
}

export interface ApplyModuleRevokesResult {
  ticked: string[];
  untickedModuleCount: number;
  revokesWritten: number;
  revokesCleared: number;
}

/**
 * Reconcile per-user module revokes against the supplied ticked-module
 * list. Returns counts for telemetry/logging.
 *
 * @param db central Prisma client (CnUserPermissionExtra is in app_quikinfra)
 * @param userId central auth.User.id (NOT cn_users.id)
 * @param orgId  tenant scope
 * @param tickedModules array of module keys the admin ticked on the form
 * @param actorUserId who triggered the change (for `grantedBy` audit)
 */
export async function applyModuleRevokes(
  db: DbCentralLike,
  userId: string,
  orgId: string,
  tickedModules: string[],
  actorUserId: string | null,
): Promise<ApplyModuleRevokesResult> {
  // Normalise + sanity-filter the input — anything outside the known
  // module keys is ignored so a typo in the form payload can't blow up
  // the permission set.
  const knownTicked = new Set(
    tickedModules.filter((m) => ALL_MODULE_KEYS.includes(m)),
  );

  // Bucket every pair in the module universe by ticked / unticked.
  const pairsToRevoke: Array<{ resource: string; action: Action }> = [];
  const pairsToClear: Array<{ resource: string; action: Action }> = [];

  for (const moduleKey of ALL_MODULE_KEYS) {
    const pairs = modulePermissionPairs(moduleKey);
    if (pairs.length === 0) continue;
    if (knownTicked.has(moduleKey)) {
      pairsToClear.push(...pairs);
    } else {
      pairsToRevoke.push(...pairs);
    }
  }

  // 1) Ensure revoke rows exist for unticked modules' pairs.
  let revokesWritten = 0;
  for (const p of pairsToRevoke) {
    await db.cnUserPermissionExtra.upsert({
      where: {
        orgId_userId_resource_action: {
          orgId,
          userId,
          resource: p.resource,
          action: p.action,
        },
      },
      // If an additive grant row exists for this pair, FLIP it to a
      // revoke. Same uniqueness guarantee — at most one row per pair.
      update: { revoke: true },
      create: {
        orgId,
        userId,
        resource: p.resource,
        action: p.action,
        revoke: true,
        grantedBy: actorUserId,
      },
    });
    revokesWritten++;
  }

  // 2) Ticked modules → write ADDITIVE GRANT rows (revoke=false) for every
  //    pair in the module. This makes "tick a module = full add/edit/delete/
  //    view on it" true for ANY role — HO, basic user, or a custom role —
  //    not just roles whose seed already grants those actions. userCan
  //    honours these as additive grants (step 3), so the module assignment
  //    itself becomes the grant; the role is no longer a ceiling for the
  //    modules you explicitly hand the user. (A per-action revoke from the
  //    permission matrix still overrides, since revoke is checked first.)
  let revokesCleared = 0;
  for (const p of pairsToClear) {
    await db.cnUserPermissionExtra.upsert({
      where: {
        orgId_userId_resource_action: {
          orgId,
          userId,
          resource: p.resource,
          action: p.action,
        },
      },
      // Flip any existing revoke row to an additive grant, or create one.
      update: { revoke: false },
      create: {
        orgId,
        userId,
        resource: p.resource,
        action: p.action,
        revoke: false,
        grantedBy: actorUserId,
      },
    });
    revokesCleared++;
  }

  return {
    ticked: Array.from(knownTicked),
    untickedModuleCount: ALL_MODULE_KEYS.length - knownTicked.size,
    revokesWritten,
    revokesCleared,
  };
}

/**
 * Reverse direction: given a user's revoke set, infer which modules are
 * "ticked" (i.e. NOT fully revoked). Used by the Add User list/detail
 * GET endpoints to drive the Edit drawer's pre-tick state once
 * cn_users.modulesAssigned is gone.
 *
 * Rule: a module is treated as TICKED unless at least one of its
 * resource-action pairs appears in the revoke set. Empty-resource
 * modules (`organization`, `quality_safety`) are SKIPPED — they have
 * no `construction.*` resources defined in the permission tree yet,
 * so we can't enforce them. Reporting them as ticked would create a
 * mismatch with the sidebar's `modulesFromPermissions` view (which
 * also skips them). Wire real resources for those modules and they'll
 * start surfacing here automatically.
 */
export function modulesFromRevokes(
  revokes: ReadonlyArray<{ resource: string; action: string }>,
): string[] {
  const revokeSet = new Set(
    revokes.map((r) => `${r.resource}:${r.action}`),
  );
  const ticked: string[] = [];
  for (const moduleKey of ALL_MODULE_KEYS) {
    const resourceList = MODULE_TO_RESOURCES[moduleKey] ?? [];
    if (resourceList.length === 0) continue;
    const pairs = modulePermissionPairs(moduleKey);
    // A module stays "ticked" (visible/assigned) as long as the user keeps
    // ANY access inside it. Only when EVERY pair in the module is revoked is
    // the module fully dropped. Using `some()` here was the bug: a single
    // unchecked Add/Edit/Delete/View box revoked one pair, which dropped the
    // whole module from `modulesAssigned`, and the Permissions page then
    // renders every page in an unassigned module as blank — so unchecking one
    // box made the entire module clear on reload.
    const allRevoked =
      pairs.length > 0 &&
      pairs.every((p) => revokeSet.has(`${p.resource}:${p.action}`));
    if (!allRevoked) ticked.push(moduleKey);
  }
  return ticked;
}
