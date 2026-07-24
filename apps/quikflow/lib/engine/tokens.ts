/**
 * Token / smart-value resolver (doc §7). Turns `{{trigger.kpi.owner}}`,
 * `{{steps.0.priorityId}}` and relative dates (`+14d`, `-3d`, `today`) into
 * real values at run time, so action params can reference the triggering record
 * and earlier step outputs.
 *
 * Two resolution modes:
 *   • whole-string token (`"{{trigger.kpi.owner}}"`) → returns the RAW value,
 *     preserving its type (an id stays a string, a number stays a number).
 *   • embedded tokens (`"{{kpi.name}} is {{kpi.gapPct}}% low"`) → interpolated
 *     into the surrounding string.
 */

export interface TokenContext {
  /** The record-enriched trigger context (see engine/record.ts). */
  trigger: Record<string, unknown>;
  /** Outputs of already-executed steps, indexed by execution order. */
  steps: Record<string, unknown>[];
}

const EMBEDDED = /\{\{\s*([^}]+?)\s*\}\}/g;
const WHOLE = /^\{\{\s*([^}]+?)\s*\}\}$/;
const RELATIVE = /^([+-])(\d+)([dwh])$/;

const UNIT_MS: Record<string, number> = { d: 86_400_000, w: 604_800_000, h: 3_600_000 };

function walk(root: unknown, parts: string[]): unknown {
  return parts.reduce<unknown>(
    (acc, key) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[key] : undefined),
    root,
  );
}

/** Resolve a token path (`trigger.…` / `steps.N.…`) against the context. */
function lookup(path: string, ctx: TokenContext): unknown {
  const parts = path.split(".");
  if (parts[0] === "trigger") return walk(ctx.trigger, parts.slice(1));
  if (parts[0] === "steps") {
    const i = Number(parts[1]);
    if (!Number.isInteger(i) || !ctx.steps[i]) return undefined;
    return walk(ctx.steps[i], parts.slice(2));
  }
  return undefined;
}

/** A relative date literal → ISO string, or null if not one. */
export function relativeDate(input: string, now: number = Date.now()): string | null {
  const s = input.trim();
  if (s === "today" || s === "now") return new Date(now).toISOString();
  const m = RELATIVE.exec(s);
  if (!m) return null;
  const sign = m[1] === "-" ? -1 : 1;
  const span = Number(m[2]) * (UNIT_MS[m[3]] ?? UNIT_MS.d);
  return new Date(now + sign * span).toISOString();
}

/** Resolve a single value (string/array/object) — the recursive core. */
function resolveValue(value: unknown, ctx: TokenContext): unknown {
  if (typeof value === "string") {
    const rel = relativeDate(value);
    if (rel) return rel;
    const whole = value.trim().match(WHOLE);
    if (whole) {
      const v = lookup(whole[1].trim(), ctx);
      return v ?? "";
    }
    return value.replace(EMBEDDED, (_, expr: string) => {
      const v = lookup(expr.trim(), ctx);
      return v == null ? "" : String(v);
    });
  }
  if (Array.isArray(value)) return value.map((v) => resolveValue(v, ctx));
  if (value && typeof value === "object") return resolveParams(value as Record<string, unknown>, ctx);
  return value;
}

/** Deep-resolve every token in an action's params object. */
export function resolveParams(
  params: Record<string, unknown> | undefined,
  ctx: TokenContext,
): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(params ?? {})) out[k] = resolveValue(v, ctx);
  return out;
}
