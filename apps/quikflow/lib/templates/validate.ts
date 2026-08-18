/**
 * Automated template validation — the "Auto-test" behind the Templates gallery.
 * A template "passes" when its graph is a real, runnable workflow: it has a
 * trigger with an event, at least one action, EVERY action is actually
 * implemented (not a simulated stub), and its edges connect real nodes.
 *
 * This is a static, side-effect-free check (no emails sent, no events created),
 * so it's safe to run across every template — it verifies the wiring, which is
 * what distinguishes a working template from a placeholder.
 */
import { findAction } from "@/lib/catalog";

export interface TemplateCheck {
  label: string;
  ok: boolean;
  detail?: string;
}

export interface TemplateTestResult {
  passed: boolean;
  checks: TemplateCheck[];
}

interface GraphNode {
  id?: string;
  kind?: string;
  config?: { actionId?: unknown; event?: unknown };
}
interface GraphEdge {
  from?: string;
  to?: string;
}

export function validateTemplate(graphNodes: unknown, graphEdges: unknown): TemplateTestResult {
  const nodes = (Array.isArray(graphNodes) ? graphNodes : []) as GraphNode[];
  const edges = (Array.isArray(graphEdges) ? graphEdges : []) as GraphEdge[];
  const checks: TemplateCheck[] = [];

  const trigger = nodes.find((n) => n.kind === "trigger");
  checks.push({
    label: "Has a trigger",
    ok: !!trigger,
    detail: trigger ? undefined : "No trigger node in the graph.",
  });

  const triggerEvent = trigger?.config?.event;
  checks.push({
    label: "Trigger has an event",
    ok: typeof triggerEvent === "string" && triggerEvent.length > 0,
    detail: typeof triggerEvent === "string" && triggerEvent ? undefined : "Trigger event is empty.",
  });

  const actions = nodes.filter((n) => n.kind === "action");
  checks.push({
    label: "Has at least one action",
    ok: actions.length > 0,
    detail: actions.length ? undefined : "No action steps.",
  });

  const simulated: string[] = [];
  for (const a of actions) {
    const id = typeof a.config?.actionId === "string" ? a.config.actionId : "";
    if (!findAction(id)?.real) simulated.push(id || "(missing actionId)");
  }
  checks.push({
    label: "All actions are implemented",
    ok: simulated.length === 0,
    detail: simulated.length ? `Not-yet-implemented (simulated) actions: ${simulated.join(", ")}` : undefined,
  });

  const ids = new Set(nodes.map((n) => n.id));
  const badEdge = edges.find((e) => !ids.has(e.from) || !ids.has(e.to));
  checks.push({
    label: "Graph edges are valid",
    ok: !badEdge,
    detail: badEdge ? `Edge ${badEdge.from} → ${badEdge.to} references a missing node.` : undefined,
  });

  return { passed: checks.every((c) => c.ok), checks };
}
