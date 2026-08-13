import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import {
  moduleByKey,
  PICKER_BY_TYPE,
  toEngineType,
  operatorsForType,
  findAction,
} from "@/lib/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/catalog/modules/[key] — field schema + events + actions for one
 * module (doc §6.1 · C3). Each field is returned with its builder picker, its
 * engine type, and the operators offered for it, so the client can render the
 * right control without reimplementing the type→operator mapping.
 */
export const GET = withOrgAuth<{ key: string }>(async (_ctx, _req, { params }) => {
  const mod = moduleByKey(params.key);
  if (!mod) {
    return NextResponse.json({ success: false, error: "Unknown module" }, { status: 404 });
  }

  const fields = mod.fields.map((f) => {
    const engineType = toEngineType(f.type);
    return {
      key: f.key,
      label: f.label,
      type: f.type,
      engineType,
      picker: PICKER_BY_TYPE[f.type],
      usableIn: f.usableIn,
      values: f.values ?? null,
      source: f.source ?? null,
      // Data-Level Design §4: where the value picker loads options from.
      valueSource: f.source ?? "static",
      // Smart-value token for referencing this field in later action params.
      token: `{{trigger.${mod.key}.${f.key}}}`,
      derived: f.derived ?? false,
      operators: f.usableIn.includes("condition") ? operatorsForType(engineType) : [],
    };
  });

  const actions = mod.actionIds
    .map((id) => {
      const a = findAction(id);
      return a ? { id: a.id, label: a.label, category: a.category, real: a.real ?? false } : null;
    })
    .filter(Boolean);

  const data = {
    key: mod.key,
    label: mod.label,
    recordNoun: mod.recordNoun,
    capabilities: mod.capabilities,
    readable: mod.binding.readable,
    fields,
    events: mod.events,
    actions,
  };
  return NextResponse.json({ success: true, data });
});
