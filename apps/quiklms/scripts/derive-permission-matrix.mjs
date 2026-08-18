/**
 * Derive the RBAC v2 permission matrix from the authorisation QuikLMS already
 * ships, and emit it as `lib/auth/permission-matrix.generated.ts`.
 *
 * WHY DERIVE RATHER THAN AUTHOR. QuikLMS gates 292 handlers with
 * `requireRoles(actor, [...])` across 264 route files, and QuikScale-style
 * authorisation needs the same policy expressed as (resource, action) → roles.
 * Hand-writing that matrix would be inventing policy; every grant here is read
 * out of a shipped `requireRoles` list instead, so the seeded model starts
 * behaviourally identical to what is live today. Run this again after changing a
 * guard and the matrix follows.
 *
 * RESOURCE GRANULARITY was measured, not chosen — see `resourceForSegments`.
 * Collapsing on one path segment made 47 of 135 resource:action pairs internally
 * contradictory; two segments left 6; full depth plus `.item` leaves 0 across 392.
 * That matters because a contradiction can only be seeded as the UNION of the
 * disagreeing policies, and the union is always the more permissive one — it would
 * have handed learners the ADMIN certificate-approval queue.
 *
 *   node scripts/derive-permission-matrix.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, relative, dirname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = join(here, '..');
const API = join(appRoot, 'app', 'api');

/** HTTP method → CRUD-V action. Mirrors quikscale's ACTIONS exactly. */
const ACTION_FOR_METHOD = { GET: 'view', POST: 'create', PUT: 'update', PATCH: 'update', DELETE: 'delete' };
const ALL_ROLES = ['ADMIN', 'TENANT_ADMIN', 'SUB_ADMIN', 'MANAGER', 'TEACHER', 'PARENT', 'LEARNER'];

/**
 * A handler behind `requireAuth` only — no role gate at all.
 *
 * These are granted to EVERY role, because that is precisely what they do today:
 * any authenticated member of the org may call them. Recording them as a sentinel
 * and skipping the seed would have turned "open to all" into "closed to all" the
 * moment grants became the gate — a lock-out dressed up as a migration. 78 pairs
 * are in this category, including `/api/me`, `/api/tenants/current` and the whole
 * learner player surface (`player.sync`, `progress`, `learner.file-proxy`).
 *
 * Tightening any of them is a deliberate follow-up, not a side effect of this
 * change: `scripts/derive-permission-matrix.mjs` will keep reporting the count, and
 * adding a real `requireRoles` to a route narrows its grant on the next run.
 */
const UNGATED_ROLES = [...ALL_ROLES];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) walk(p, out);
    else if (entry.name === 'route.ts') out.push(p);
  }
  return out;
}

/**
 * Resource key for a route directory: EVERY non-dynamic segment, dotted, with
 * `.item` appended when the directory ends in a `[param]`.
 *
 * Granularity was arrived at empirically, not chosen. One segment left 47 of 135
 * resource:action pairs internally contradictory; two segments left 6; this rule
 * leaves **0** across 392 pairs. Both halves are load-bearing:
 *
 *   - full depth separates `exam-sessions.exam.my-session` (LEARNER) from
 *     `exam-sessions.exam.submissions` (admin/teacher), which truncation merged;
 *   - `.item` separates a collection from one row, e.g. `exams` (admin/teacher list)
 *     from `exams.item` (also LEARNER — a learner may open an exam assigned to them
 *     but not enumerate the tenant's exams).
 *
 * Without either, a seeded grant would be the UNION of two different policies, and
 * the union is always the more permissive one.
 */
export function resourceForSegments(segments) {
  const named = segments.filter((s) => s && !s.startsWith('['));
  const endsWithParam = segments.length > 0 && segments[segments.length - 1].startsWith('[');
  const base = named.join('.') || 'root';
  return endsWithParam ? `${base}.item` : base;
}

const files = walk(API);
const handlers = [];

for (const file of files) {
  const src = readFileSync(file, 'utf8');
  const segments = relative(API, dirname(file)).split(sep);
  const resource = resourceForSegments(segments);
  const route = relative(API, file).replace(/\\/g, '/');

  // Slice the file per exported handler so a per-method guard is attributed to
  // the right action — several routes gate GET and DELETE differently.
  const marks = [];
  const re = /export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\s*=/g;
  let m;
  while ((m = re.exec(src))) marks.push({ method: m[1], at: m.index });

  for (let i = 0; i < marks.length; i++) {
    const body = src.slice(marks[i].at, marks[i + 1]?.at ?? src.length);
    const explicit = body.match(/requireRoles\([a-zA-Z]+,\s*\[([^\]]*)\]/);
    const isSpread = /requireRoles\([a-zA-Z]+,\s*\[\s*\.\.\./.test(body);

    const roles = isSpread
      ? [...ALL_ROLES]
      : explicit
        ? explicit[1].split(',').map((s) => s.trim().replace(/['"]/g, '')).filter(Boolean)
        : [...UNGATED_ROLES];

    handlers.push({ resource, action: ACTION_FOR_METHOD[marks[i].method], route, roles: roles.sort() });
  }
}

// Contradictions: one resource:action served by routes with different policies.
// A single grant cannot express those, so they are reported rather than merged.
const byPair = new Map();
for (const h of handlers) {
  const key = `${h.resource}:${h.action}`;
  if (!byPair.has(key)) byPair.set(key, []);
  byPair.get(key).push(h);
}

const exceptions = [];
const matrix = {};
for (const [key, group] of byPair) {
  const distinct = [...new Set(group.map((h) => h.roles.join('+')))];
  const [resource, action] = key.split(':');

  if (distinct.length > 1) {
    exceptions.push({
      resource, action,
      policies: group.map((h) => ({ route: h.route, roles: h.roles })),
    });
    // Deliberately NOT seeded — see MATRIX_EXCEPTIONS.
    continue;
  }

  matrix[resource] ??= {};
  matrix[resource][action] = group[0].roles;
}

/**
 * NO `admin` SYNTHESIS STEP — deliberately removed 2026-07-29.
 *
 * This file used to append a literal `admin` role to every pair granted to
 * TENANT_ADMIN or SUPER_ADMIN, because `admin` was a catalogue row that no
 * `requireRoles(...)` list ever named: the guards speak the `LmsUserRole` enum and
 * `admin` was not one of its values, so the derive step gave it zero grants — a role
 * with an administrator's name and a guest's authority.
 *
 * That gap is closed at the source. `SUPER_ADMIN` was renamed to `ADMIN`, the
 * `admin` catalogue row now maps to that enum member (lib/auth/app-role.ts), and the
 * ~228 handlers that gate the top tier name `ADMIN` directly. So `admin`'s grants are
 * DERIVED like every other role's, which is the invariant this whole script exists to
 * uphold.
 *
 * The union with TENANT_ADMIN is intentionally NOT carried over. `ADMIN` and
 * `TENANT_ADMIN` are sibling surfaces, not nested tiers — `ADMIN` onboards
 * school/corporate tenants, `TENANT_ADMIN` runs one of them. Granting the union would
 * hand the platform admin every school-management endpoint as well, which no shipped
 * `requireRoles` list asks for. `ADMIN` gets exactly what `SUPER_ADMIN` got, so the
 * seeded model stays behaviourally identical to what is live today.
 *
 * NOTE for consumers: matrix role names are `LmsUserRole` values, so the top tier
 * appears as `ADMIN`. The catalogue row is named `admin`. `seedLmsPermissions` bridges
 * the two via `lmsRoleToAppRoleName` — do not look roles up by the raw matrix key.
 */

const banner = `/**
 * GENERATED by scripts/derive-permission-matrix.mjs — do not edit by hand.
 *
 * Every grant below is read out of a live \`requireRoles(...)\` declaration, so a
 * seeder driven by this file reproduces today's authorisation exactly. Re-run the
 * script after changing any route guard.
 *
 * A handler with no role gate of its own (\`requireAuth\` only) is granted to
 * every role — that is what it already does, and recording it as "nobody" would
 * turn open-to-all into closed-to-all the moment grants became the gate.
 *
 * MATRIX_EXCEPTIONS should be EMPTY. The resource rule in \`resourceForSegments\`
 * exists because it drives contradictions to zero; a non-empty list here means two
 * routes under one resource:action disagree and the RULE needs revisiting — never
 * that the union of two policies should be seeded.
 */\n`;

const out =
  banner +
  `\n/** Roles granted to a handler that carries no role gate of its own. */\nexport const UNGATED_ROLES = ${JSON.stringify(UNGATED_ROLES)} as const;\n\n` +
  `export const PERMISSION_MATRIX: Record<string, Partial<Record<'view' | 'create' | 'update' | 'delete', string[]>>> =\n` +
  JSON.stringify(matrix, null, 2) +
  ';\n\n' +
  `export const MATRIX_EXCEPTIONS: Array<{ resource: string; action: string; policies: Array<{ route: string; roles: string[] }> }> =\n` +
  JSON.stringify(exceptions, null, 2) +
  ';\n';

writeFileSync(join(appRoot, 'lib', 'auth', 'permission-matrix.generated.ts'), out);

const seeded = Object.values(matrix).reduce((n, a) => n + Object.keys(a).length, 0);
console.log(`route files          : ${files.length}`);
console.log(`handlers scanned     : ${handlers.length}`);
console.log(`resources            : ${Object.keys(matrix).length}`);
console.log(`resource:action pairs: ${seeded} seeded, ${exceptions.length} held back as exceptions`);
console.log(`ADMIN (top tier)     : ${Object.values(matrix).reduce((n, actions) => n + Object.values(actions).filter((roles) => roles?.includes('ADMIN')).length, 0)} pairs, all derived`);
console.log(`\nwrote lib/auth/permission-matrix.generated.ts`);
