import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import type { Prisma } from "@quikit/database";
import { prisma } from "@/lib/db/prisma";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import { canEditStructure, softDelete, LifecycleError } from "@/lib/services/automation/lifecycle";
import type { WorkflowEdge, WorkflowNode } from "@/types/workflow";

export const runtime = "nodejs";

/**
 * [P3.A1] GET/PATCH a single workflow definition. Only POST-create existed
 * (SURVEY #4); the builder needs load-back (GET) and edit-persist (PATCH).
 *
 * Structure-lock (SPEC §7, Live-Edit): once a definition leaves Draft its
 * STRUCTURE is immutable — content-only edits (email body, field value, wait
 * duration, condition values) are still allowed. Structure = the set of node
 * ids/kinds, the edge topology, and the trigger kind; content = each node's
 * `config`. The Draft-only gate is `canEditStructure()` from the S1 lifecycle
 * service — this route consumes it, it does NOT re-encode the rule.
 *
 * All reads/writes are tenant-scoped (Constraint 1.4). Response shape matches
 * the workflow route family (raw JSON object; errors as `{ error }`).
 */

const nodeSchema = z.object({
  id: z.string().min(1),
  kind: z.string().min(1),
  config: z.record(z.unknown()).default({}),
});
const edgeSchema = z.object({
  from: z.string().min(1),
  to: z.string().min(1),
  branch: z.enum(["true", "false"]).optional(),
});

const updateSchema = z
  .object({
    name: z.string().min(1).optional(),
    triggerType: z.string().nullable().optional(),
    triggerSummary: z.string().nullable().optional(),
    graphNodes: z.array(nodeSchema).optional(),
    graphEdges: z.array(edgeSchema).optional(),
  })
  .refine((b) => Object.keys(b).length > 0, { message: "Empty update" });

/** Structural identity of a node — kind arrives as a plain string from the wire. */
type NodeIdentity = { id: string; kind: string };

/** Node fingerprint that ignores `config` — id + kind is the structural identity. */
function nodeTopology(nodes: NodeIdentity[]): string {
  return nodes
    .map((n) => `${n.id}:${n.kind}`)
    .sort()
    .join("|");
}

/** Edge fingerprint — source, target, and branch label form the topology. */
function edgeTopology(edges: WorkflowEdge[]): string {
  return edges
    .map((e) => `${e.from}->${e.to}:${e.branch ?? ""}`)
    .sort()
    .join("|");
}

/**
 * True when the incoming update would change the graph's STRUCTURE (nodes
 * added/removed/re-kinded, edges rewired, or the trigger kind changed) versus
 * content-only edits to node config. Fields not present in the update inherit
 * the stored value, so a name-only or config-only PATCH is never structural.
 */
function isStructuralChange(
  existing: { graphNodes: unknown; graphEdges: unknown; triggerType: string | null },
  next: {
    graphNodes?: NodeIdentity[];
    graphEdges?: WorkflowEdge[];
    triggerType?: string | null;
    name?: string;
    triggerSummary?: string | null;
  },
): boolean {
  const curNodes = (existing.graphNodes as WorkflowNode[]) ?? [];
  const curEdges = (existing.graphEdges as WorkflowEdge[]) ?? [];
  if (next.graphNodes && nodeTopology(next.graphNodes) !== nodeTopology(curNodes)) return true;
  if (next.graphEdges && edgeTopology(next.graphEdges) !== edgeTopology(curEdges)) return true;
  if (next.triggerType !== undefined && next.triggerType !== existing.triggerType) return true;
  return false;
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "automations", "view");

    const wf = await prisma.qcfWorkflowDefinition.findFirst({
      where: { id, orgId: user.orgId, deletedAt: null },
    });
    if (!wf) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json(wf);
  } catch (e) {
    return errorResponse(e);
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "automations", "edit");

    const parsed = updateSchema.safeParse(await req.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: "Invalid body" }, { status: 400 });

    const existing = await prisma.qcfWorkflowDefinition.findFirst({
      where: { id, orgId: user.orgId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    // Structure immutability once published — content-only edits still allowed.
    if (!canEditStructure(existing.status) && isStructuralChange(existing, parsed.data)) {
      return NextResponse.json(
        {
          error:
            "Cannot change the structure of a published automation. Unpublish to Draft to add, remove, or reconnect nodes; content edits (field values, email body, wait duration, conditions) are still allowed.",
        },
        { status: 409 },
      );
    }

    const data: Prisma.QcfWorkflowDefinitionUpdateInput = {};
    if (parsed.data.name !== undefined) data.name = parsed.data.name;
    if (parsed.data.triggerType !== undefined) data.triggerType = parsed.data.triggerType;
    if (parsed.data.triggerSummary !== undefined) data.triggerSummary = parsed.data.triggerSummary;
    if (parsed.data.graphNodes !== undefined) data.graphNodes = parsed.data.graphNodes as Prisma.InputJsonValue;
    if (parsed.data.graphEdges !== undefined) data.graphEdges = parsed.data.graphEdges as Prisma.InputJsonValue;

    const wf = await prisma.qcfWorkflowDefinition.update({
      where: { id: existing.id }, // tenant ownership already asserted by the scoped findFirst
      data,
    });
    return NextResponse.json(wf);
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * [P3.A5] Soft-delete (recoverable) via the S1 lifecycle service — never a hard
 * delete (SPEC §7). Rejected while Draining (must be Stopped first); the service
 * owns that rule. Tenant-scoped (Constraint 1.4).
 */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "automations", "delete");

    const existing = await prisma.qcfWorkflowDefinition.findFirst({
      where: { id, orgId: user.orgId, deletedAt: null },
    });
    if (!existing) return NextResponse.json({ error: "Not found" }, { status: 404 });

    const wf = await softDelete(user.orgId, id);
    return NextResponse.json(wf);
  } catch (e) {
    if (e instanceof LifecycleError) return NextResponse.json({ error: e.message }, { status: 400 });
    return errorResponse(e);
  }
}
