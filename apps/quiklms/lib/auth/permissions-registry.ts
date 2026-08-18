/**
 * Resource + action vocabulary for RBAC v2, and the rule that maps a request to
 * one (resource, action) pair.
 *
 * Mirrors `apps/quikscale/lib/api/permissionsRegistry.ts` in intent — one closed
 * set of actions, one resource per gated thing — but derives its resources from
 * QuikLMS's route tree instead of hand-listing them, because QuikLMS has 353 route
 * files and quikscale's tree names quikscale's domains (KPI, OPSP, Habits), none of
 * which transfer.
 *
 * THE RESOURCE RULE: first TWO non-dynamic path segments under /api, dotted.
 *
 * That granularity is load-bearing, not cosmetic. Collapsing on ONE segment makes
 * 47 of 135 resource:action pairs internally contradictory — `certificates:view`
 * alone spans five different role lists, from a ADMIN-only approval queue
 * (`certificates/pending-approvals`) to a learner's own list
 * (`certificates/my-certificates`). One grant cannot serve both, and seeding from
 * the union would hand learners the approval queue. Two segments reduces that to 6
 * contradictions, which are held out of the matrix as `MATRIX_EXCEPTIONS` for a
 * human to split rather than guessed at.
 */

/** CRUD-V, byte-identical to quikscale's ACTIONS. */
export const ACTIONS = ['view', 'create', 'update', 'delete'] as const;
export type Action = (typeof ACTIONS)[number];

export function isAction(value: string): value is Action {
  return (ACTIONS as readonly string[]).includes(value);
}

/** HTTP method → action. PUT and PATCH both mean update. */
const ACTION_FOR_METHOD: Record<string, Action> = {
  GET: 'view',
  POST: 'create',
  PUT: 'update',
  PATCH: 'update',
  DELETE: 'delete',
};

export function actionForMethod(method: string): Action | null {
  return ACTION_FOR_METHOD[method.toUpperCase()] ?? null;
}

/**
 * Resource key for a request path.
 *
 * Dynamic segments are dropped rather than kept, so `/api/courses/abc123/modules`
 * and `/api/courses/def456/modules` are the same resource — the id identifies the
 * row, not the permission. Instance-level rules ("only your own") stay in the
 * per-feature helpers; this is the class-level key only.
 *
 * Accepts a pathname with or without the `/api` prefix.
 */
export function resourceForPath(pathname: string): string {
  const segments = pathname
    .split('?')[0]
    .split('/')
    .filter(Boolean)
    .filter((s) => s !== 'api');

  // MUST mirror `resourceForSegments` in scripts/derive-permission-matrix.mjs
  // exactly: every named segment, dotted, plus `.item` when the path ENDS in an id.
  // A key produced here that the generator never emitted is compared against a
  // grant that does not exist, which reads as a denial — that is how an earlier
  // truncate-then-drop version reported every tenant admin loading their own
  // branding as a refusal of `tenants:view`.
  //
  // `.item` is what separates a collection from one row, and the two genuinely
  // differ: a LEARNER may open `exams.item` (an exam assigned to them) but not
  // `exams` (enumerate the tenant's exams).
  const named = segments.filter((s) => !looksLikeId(s));
  const endsWithId = segments.length > 0 && looksLikeId(segments[segments.length - 1]);
  const base = named.join('.') || 'root';
  return endsWithId ? `${base}.item` : base;
}

/**
 * Is this segment an id rather than a route name?
 *
 * cuid/uuid/mongo-id/numeric all appear in QuikLMS URLs. Route names in this app
 * are kebab-case words, so "contains a digit and is long" or "is all digits"
 * separates them without a registry lookup.
 */
function looksLikeId(segment: string): boolean {
  if (/^\d+$/.test(segment)) return true;
  if (segment.length >= 16 && /\d/.test(segment)) return true;
  return /^[0-9a-f]{8}-[0-9a-f]{4}-/i.test(segment);
}
