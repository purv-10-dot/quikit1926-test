import type { NextRequest } from "next/server";
import { deleteChild } from "@/lib/customers/children";

export const dynamic = "force-dynamic";

export async function DELETE(_request: NextRequest, { params }: { params: { id: string; childId: string } }) {
  return deleteChild("documents", params.id, params.childId);
}
