/**
 * Resolve the "Show a screen" transition screen for a status move: the screen a
 * transition's show_screen rule references, its ordered fields, and which are
 * required. Used by the move-time screen modal + the server-side gate.
 *
 * Required = Summary always; a custom field if its QtCustomField.isRequired.
 * Built-ins other than Summary are optional.
 */
import { db } from "@/lib/db";
import { resolveWorkflowGraph } from "../workflow/resolve-workflow";
import { findTransition } from "../workflow/graph";
import { SCREEN_FIELDS, isCustomFieldKey, CUSTOM_FIELD_PREFIX } from "./field-registry";

export interface TransitionScreenField {
  key: string;
  label: string;
  /** "text" | "number" | "date" | "custom" — drives the modal input. */
  kind: string;
  required: boolean;
}

export interface TransitionScreen {
  screenId: string;
  screenName: string;
  fields: TransitionScreenField[];
}

const BUILTIN_KIND: Record<string, string> = {
  summary: "text", description: "text", title: "text",
  priority: "text", assignee: "text", reporter: "text", resolution: "text",
  storyPoints: "number", eta: "number", dueDate: "date", startDate: "date",
};

/**
 * The screen that gates moving `issue` (its current status) → `toStatusId`, or
 * null when there's no published workflow / no matching transition / no
 * show_screen rule / a missing screen.
 */
export async function getTransitionScreen(params: {
  orgId: string;
  projectId: string;
  issueType: string;
  fromStatusId: string;
  toStatusId: string;
}): Promise<TransitionScreen | null> {
  const graph = await resolveWorkflowGraph(params.projectId, params.issueType);
  if (!graph) return null;
  const transition = findTransition(graph, params.fromStatusId, params.toStatusId);
  if (!transition) return null;

  const screenRule = transition.rules.find((r) => r.type === "show_screen");
  const screenId = screenRule ? String(screenRule.config.screenId ?? "") : "";
  if (!screenId) return null;

  const screen = await db.qtScreen.findFirst({
    where: { id: screenId, orgId: params.orgId, isDeleted: false },
    select: {
      name: true,
      tabs: {
        orderBy: { orderNo: "asc" },
        select: { fields: { orderBy: { orderNo: "asc" }, select: { fieldKey: true } } },
      },
    },
  });
  if (!screen) return null;

  const fieldKeys = screen.tabs.flatMap((t) => t.fields.map((f) => f.fieldKey));

  // Resolve custom-field metadata (label + isRequired) for the cf: keys present.
  const cfKeys = fieldKeys.filter(isCustomFieldKey).map((k) => k.slice(CUSTOM_FIELD_PREFIX.length));
  const customFields = cfKeys.length
    ? await db.qtCustomField.findMany({
        where: { orgId: params.orgId, key: { in: cfKeys }, isDeleted: false },
        select: { key: true, name: true, isRequired: true, type: true },
      })
    : [];
  const cfByKey = new Map(customFields.map((f) => [f.key, f] as const));
  const builtinLabel = new Map(SCREEN_FIELDS.map((f) => [f.key, f.label] as const));

  const fields: TransitionScreenField[] = [];
  for (const key of fieldKeys) {
    if (isCustomFieldKey(key)) {
      const cf = cfByKey.get(key.slice(CUSTOM_FIELD_PREFIX.length));
      if (!cf) continue; // custom field archived/deleted → skip
      fields.push({ key, label: cf.name, kind: "custom", required: cf.isRequired });
    } else {
      const label = builtinLabel.get(key);
      if (!label) continue;
      // Summary is always required; other built-ins are optional on a screen.
      fields.push({ key, label, kind: BUILTIN_KIND[key] ?? "text", required: key === "summary" });
    }
  }

  return { screenId, screenName: screen.name, fields };
}

/** The required field keys for a transition screen (empty if no screen). */
export async function requiredScreenFieldKeys(params: {
  orgId: string;
  projectId: string;
  issueType: string;
  fromStatusId: string;
  toStatusId: string;
}): Promise<string[]> {
  const screen = await getTransitionScreen(params);
  return screen ? screen.fields.filter((f) => f.required).map((f) => f.key) : [];
}

