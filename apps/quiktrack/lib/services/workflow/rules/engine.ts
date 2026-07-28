/**
 * Pure rule-evaluation engine (Phase 3). Orchestrates the built-in registries
 * over a RuleContext. No DB — the DB-backed primitives arrive via ctx.prim, so
 * this is fully unit-testable.
 *
 * Grouping: conditions with the same groupNo are OR'd; groups are AND'd. An
 * empty condition list = always available. Unknown condition type fails safe
 * (treated as false). Validators run in orderNo order and ALL failures are
 * aggregated. Post-functions run in orderNo order and their patches merge.
 *
 * See apps/quiktrack/WORKFLOW_INTEGRATION_PLAN.md §2.
 */
import { CONDITION_REGISTRY } from "./conditions";
import { VALIDATOR_REGISTRY } from "./validators";
import { POSTFUNCTION_REGISTRY } from "./post-functions";
import type {
  PostFunctionResult,
  RuleContext,
  RuleSpec,
  ValidatorFailure,
} from "./context";

/** AND across groups, OR within a group. Empty → true. Unknown type → false. */
export async function evaluateConditions(
  ctx: RuleContext,
  conditions: RuleSpec[],
): Promise<boolean> {
  if (conditions.length === 0) return true;
  const byGroup = new Map<number, RuleSpec[]>();
  for (const c of conditions) {
    const g = byGroup.get(c.groupNo) ?? [];
    g.push(c);
    byGroup.set(c.groupNo, g);
  }
  for (const group of byGroup.values()) {
    let anyPass = false;
    for (const c of group) {
      const handler = CONDITION_REGISTRY[c.type];
      const pass = handler ? await handler.evaluate(ctx, c.config) : false;
      if (pass) {
        anyPass = true;
        break;
      }
    }
    if (!anyPass) return false; // this AND-group failed
  }
  return true;
}

/** Run validators in orderNo order; aggregate every failure. */
export async function runValidators(
  ctx: RuleContext,
  validators: RuleSpec[],
): Promise<ValidatorFailure[]> {
  const failures: ValidatorFailure[] = [];
  const ordered = [...validators].sort((a, b) => a.orderNo - b.orderNo);
  for (const v of ordered) {
    const handler = VALIDATOR_REGISTRY[v.type];
    if (!handler) continue;
    try {
      const f = await handler.validate(ctx, v.config, v.errorMessage);
      if (f) failures.push(f);
    } catch {
      failures.push({ message: `Validator "${v.type}" failed to run.` });
    }
  }
  return failures;
}

/** Run post-functions in orderNo order; merge their patches (later wins). */
export async function runPostFunctions(
  ctx: RuleContext,
  postFunctions: RuleSpec[],
): Promise<PostFunctionResult["patch"]> {
  let patch: PostFunctionResult["patch"] = {};
  const ordered = [...postFunctions].sort((a, b) => a.orderNo - b.orderNo);
  for (const p of ordered) {
    const handler = POSTFUNCTION_REGISTRY[p.type];
    if (!handler) continue;
    const res = await handler.run(ctx, p.config);
    if (res.patch) patch = { ...patch, ...res.patch };
  }
  return patch;
}

/** Save-time config validation for one rule. Returns error strings (empty = ok). */
export function validateRuleConfig(
  kind: "CONDITION" | "VALIDATOR" | "POSTFUNCTION",
  type: string,
  config: Record<string, unknown>,
): string[] {
  const handler =
    kind === "CONDITION"
      ? CONDITION_REGISTRY[type]
      : kind === "VALIDATOR"
        ? VALIDATOR_REGISTRY[type]
        : POSTFUNCTION_REGISTRY[type];
  if (!handler) return [`Unknown ${kind.toLowerCase()} type: ${type}`];
  return handler.validateConfig ? handler.validateConfig(config) : [];
}

/** The registered type keys per kind (for the Add Rule UI + config validation). */
export const RULE_TYPES = {
  CONDITION: Object.keys(CONDITION_REGISTRY),
  VALIDATOR: Object.keys(VALIDATOR_REGISTRY),
  POSTFUNCTION: Object.keys(POSTFUNCTION_REGISTRY),
} as const;
