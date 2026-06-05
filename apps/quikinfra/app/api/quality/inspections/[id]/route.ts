import { NextResponse } from "next/server";
import { z } from "zod";
import { withOrgAuthForModule } from "@/lib/api/withOrgAuth";
import {
  findInspectionById,
  updateInspection,
  softDeleteInspection,
} from "@/lib/quality/inspections-repository";

const withOrgAuth = withOrgAuthForModule("quality");

const patchSchema = z.object({
  projectId: z.string().optional(),
  boqItem: z.string().nullable().optional(),
  checklistName: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  result: z.enum(["Pass", "Fail", "Conditional"]).nullable().optional(),
  status: z.string().nullable().optional(),
  remarks: z.string().nullable().optional(),
  items: z.array(z.any()).optional(),
});

export const GET = withOrgAuth<{ id: string }>(async ({ orgId }, _req, { params }) => {
  const insp = await findInspectionById(orgId, params.id);
  if (!insp) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: insp });
});

export const PATCH = withOrgAuth<{ id: string }>(async ({ orgId, userId }, req, { params }) => {
  const input = patchSchema.parse(await req.json());
  const insp = await updateInspection(orgId, params.id, { ...input, updatedBy: userId });
  if (!insp) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true, data: insp });
});

export const DELETE = withOrgAuth<{ id: string }>(async ({ orgId, userId }, _req, { params }) => {
  const ok = await softDeleteInspection(orgId, params.id, userId);
  if (!ok) return NextResponse.json({ success: false, error: "Not found" }, { status: 404 });
  return NextResponse.json({ success: true });
});
