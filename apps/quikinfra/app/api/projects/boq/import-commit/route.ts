import { requireProjectsFinanceAction } from "@/lib/auth/requireProjectsFinanceAction";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import { z } from "zod";

const withOrgAuth = withOrgAuthForModule("projects");

/**
 * POST /api/projects/boq/import-commit
 * body: {
 *   boqNumber, projectId, boqDate, remarks?,
 *   rows: [ { kind, code, description, uomCode, group, quantity, rate, gstRate } ]
 * }
 *
 * Resolves UOM by code on the fly, creates a draft BOQ with hierarchical
 * items. If a row has `group` field set, the server will auto-create a group
 * header with that name (once) and attach items to it.
 */

const rowSchema = z.object({
  kind: z.enum(["item", "group"]).default("item"),
  code: z.string().nullable().optional(),
  description: z.string().min(1),
  uomCode: z.string().nullable().optional(),
  group: z.string().nullable().optional(),
  quantity: z.number().positive().nullable().optional(),
  rate: z.number().min(0).nullable().optional(),
  gstRate: z.number().min(0).max(100).nullable().optional(),
});
const commitSchema = z.object({
  boqNumber: z.string().min(1).max(50),
  projectId: z.string().min(1),
  boqDate: z.string().min(1),
  currency: z.string().default("INR"),
  remarks: z.string().nullable().optional(),
  rows: z.array(rowSchema).min(1),
});

export const POST = withOrgAuth(async ({ orgId, userId }, req) => {
  const body = await req.json();
  const input = commitSchema.parse(body);

  const project = await db.cnProject.findFirst({ where: { id: input.projectId, orgId }, select: { id: true } });
  if (!project) return NextResponse.json({ success: false, error: "Project not found" }, { status: 400 });

  const dup = await db.cnBOQ.findFirst({ where: { orgId, boqNumber: input.boqNumber, deletedAt: null }, select: { id: true } });
  if (dup) return NextResponse.json({ success: false, error: `BOQ '${input.boqNumber}' already exists` }, { status: 409 });

  // Resolve UOM codes
  const uomCodes = [...new Set(input.rows.map(r => r.uomCode).filter(Boolean) as string[])];
  const uoms = await db.cnUOM.findMany({ where: { orgId, code: { in: uomCodes } }, select: { id: true, code: true } });
  const uomByCode = new Map(uoms.map(u => [u.code, u.id]));
  const missingUoms = uomCodes.filter(c => !uomByCode.has(c));
  if (missingUoms.length > 0) {
    return NextResponse.json(
      { success: false, error: `UOM codes not in Masters → UOM: ${missingUoms.join(", ")}. Add them first.` },
      { status: 400 },
    );
  }

  let subtotal = 0, taxAmount = 0;
  for (const r of input.rows) {
    if (r.kind === "group") continue;
    const amt = (r.quantity ?? 0) * (r.rate ?? 0);
    subtotal += amt;
    if (r.gstRate) taxAmount += amt * (r.gstRate / 100);
  }

  const boq = await db.$transaction(async (tx) => {
    const created = await tx.cnBOQ.create({
      data: {
        orgId, projectId: input.projectId,
        boqNumber: input.boqNumber,
        boqDate: new Date(input.boqDate),
        currency: input.currency,
        subtotal, taxAmount, total: subtotal + taxAmount,
        status: "draft", remarks: input.remarks ?? "Imported from spreadsheet",
        createdBy: userId,
      },
    });

    // Auto-create group headers for rows that reference a named group
    const groupIdByName = new Map<string, string>();
    let sortCounter = 0;
    for (const r of input.rows) {
      if (r.kind === "group") {
        const g = await tx.cnBOQItem.create({
          data: {
            boqId: created.id, sortOrder: sortCounter++, kind: "group",
            description: r.description, code: r.code ?? null, amount: 0,
          },
        });
        groupIdByName.set(r.description, g.id);
      } else {
        // Auto-create group if row.group is set + not already materialized
        let parentId: string | null = null;
        if (r.group && !groupIdByName.has(r.group)) {
          const g = await tx.cnBOQItem.create({
            data: {
              boqId: created.id, sortOrder: sortCounter++, kind: "group",
              description: r.group, amount: 0,
            },
          });
          groupIdByName.set(r.group, g.id);
        }
        if (r.group) parentId = groupIdByName.get(r.group) ?? null;

        const amt = (r.quantity ?? 0) * (r.rate ?? 0);
        await tx.cnBOQItem.create({
          data: {
            boqId: created.id, sortOrder: sortCounter++, kind: "item",
            parentId,
            code: r.code ?? null, description: r.description,
            uomId: r.uomCode ? uomByCode.get(r.uomCode)! : null,
            quantity: r.quantity ?? null, rate: r.rate ?? null,
            gstRate: r.gstRate ?? null, amount: amt,
          },
        });
      }
    }
    return created;
  });

  return NextResponse.json({ success: true, data: boq }, { status: 201 });
}, { permission: { resource: "construction.boq", action: "import" } });
