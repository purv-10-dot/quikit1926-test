import { NextResponse } from "next/server";
import { withOrgAuth } from "@/lib/api/withOrgAuth";
import { db } from "@/lib/db";

type Params = { id: string };

/**
 * GET /api/templates/:id — full template (incl. graph) so the builder can
 * prefill a new workflow from it. The trigger is reconstructed from the
 * template's trigger node config (templates store only graphNodes/graphEdges).
 */
export const GET = withOrgAuth<Params>(async (_ctx, _req, { params }) => {
  const tpl = await db.wfTemplate.findUnique({ where: { id: params.id } });
  if (!tpl) {
    return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
  }

  const nodes = Array.isArray(tpl.graphNodes)
    ? (tpl.graphNodes as { kind?: string; config?: Record<string, unknown> }[])
    : [];
  const triggerNode = nodes.find((n) => n?.kind === "trigger");
  const cfg = (triggerNode?.config ?? {}) as Record<string, unknown>;
  const trigger = {
    app: (cfg.app as string) ?? tpl.app,
    module: cfg.module ?? "",
    event: cfg.event ?? "",
    ...(cfg.filter ? { filter: cfg.filter } : {}),
  };

  return NextResponse.json({
    success: true,
    data: { id: tpl.id, name: tpl.name, app: tpl.app, trigger, graphNodes: tpl.graphNodes },
  });
});

/**
 * PATCH /api/templates/:id — mark a template as manually verified end-to-end
 * (or clear that flag). Admin-only: this is a global claim shown to every org
 * on the Templates gallery, not per-org state.
 */
export const PATCH = withOrgAuth<Params>(
  async (_ctx, req, { params }) => {
    const body = (await req.json().catch(() => ({}))) as { isTested?: boolean };
    if (typeof body.isTested !== "boolean") {
      return NextResponse.json({ success: false, error: "isTested (boolean) is required" }, { status: 400 });
    }

    const tpl = await db.wfTemplate.findUnique({ where: { id: params.id } });
    if (!tpl) {
      return NextResponse.json({ success: false, error: "Template not found" }, { status: 404 });
    }

    const updated = await db.wfTemplate.update({
      where: { id: params.id },
      data: { isTested: body.isTested, lastTestedAt: body.isTested ? new Date() : null },
    });

    return NextResponse.json({
      success: true,
      data: { id: updated.id, isTested: updated.isTested, lastTestedAt: updated.lastTestedAt?.toISOString() ?? null },
    });
  },
  { requireAdmin: true },
);
