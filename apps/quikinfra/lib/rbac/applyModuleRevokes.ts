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
 * @param previouslyTicked modules the user ALREADY had before this save.
 *        Pass it on edits so a module that didn't change is reconciled
 *        non-destructively — see the pairsToClear block below.
 */
export async function applyModuleRevokes(
  db: DbCentralLike,
  userId: string,
  orgId: string,
  tickedModules: string[],
  actorUserId: string | null,
  previouslyTicked?: readonly string[] | null,
): Promise<ApplyModuleRevokesResult> {
  // Normalise + sanity-filter the input — anything outside the known
  // module keys is ignored so a typo in the form payload can't blow up
  // the permission set.
  const knownTicked = new Set(
    tickedModules.filter((m) => ALL_MODULE_KEYS.includes(m)),
  );

  // Modules the user already had. A module present in BOTH lists is
  // "unchanged" — the admin didn't touch it on this save, so its pairs are
  // reconciled non-destructively (fill gaps, never flip an existing row).
  // Without this, every Edit-User save re-granted the FULL action set on
  // every page of every assigned module, wiping the per-page rights the
  // admin had set on the Permissions screen — the "grant 2-3 sub-modules,
  // the rest get selected again" report.
  const knownPrevious = previouslyTicked
    ? new Set(previouslyTicked.filter((m) => ALL_MODULE_KEYS.includes(m)))
    : null;

  // Bucket every pair in the module universe by ticked / unticked.
  const pairsToRevoke: Array<{ resource: string; action: Action }> = [];
  const pairsToClear: Array<{ resource: string; action: Action }> = [];
  const pairsToBackfill: Array<{ resource: string; action: Action }> = [];

  for (const moduleKey of ALL_MODULE_KEYS) {
    const pairs = modulePermissionPairs(moduleKey);
    if (pairs.length === 0) continue;
    if (!knownTicked.has(moduleKey)) {
      pairsToRevoke.push(...pairs);
    } else if (knownPrevious?.has(moduleKey)) {
      pairsToBackfill.push(...pairs);
    } else {
      pairsToClear.push(...pairs);
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

  // 3) Modules that were ALREADY ticked before this save: create any pair
  //    that has no row yet (so a module assigned before the additive-grant
  //    era still gets its grants) but leave existing rows exactly as they
  //    are. That is what preserves a per-page revoke written from the
  //    Permissions matrix across an unrelated Edit-User save.
  for (const p of pairsToBackfill) {
    await db.cnUserPermissionExtra.upsert({
      where: {
        orgId_userId_resource_action: {
          orgId,
          userId,
          resource: p.resource,
          action: p.action,
        },
      },
      update: {},
      create: {
        orgId,
        userId,
        resource: p.resource,
        action: p.action,
        revoke: false,
        grantedBy: actorUserId,
      },
    });
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
    // A module stays "ticked" (visible/assigned) as long as the user can
    // VIEW at least one of its resources. Basing this on the `view` action
    // — not the full pair set — is deliberate and fixes a real bug:
    //
    //   The Permissions matrix only writes revokes for the actions it can
    //   express (view/create/edit/delete + the ones those columns govern).
    //   Some resources carry actions the matrix CANNOT revoke — e.g.
    //   construction.diesel has a tree-level `delete` but the Diesel page is
    //   write-only (no delete column). So even after the admin turned every
    //   page in a module off, `every(pair revoked)` was never true (the
    //   un-revocable pair lingered), and the whole module stayed "assigned"
    //   forever — the "grant only X, reopen, the rest are still selected"
    //   report. `view` is the honest signal: no view anywhere → the user
    //   can't reach any page in the module → it's not assigned.
    //
    // Revoking a single non-view action still keeps the module ticked (the
    // user retains the rest of it), preserving the earlier single-box fix.
    const anyViewable = resourceList.some(
      (resource) => !revokeSet.has(`${resource}:view`),
    );
    if (anyViewable) ticked.push(moduleKey);
  }
  return ticked;
}
