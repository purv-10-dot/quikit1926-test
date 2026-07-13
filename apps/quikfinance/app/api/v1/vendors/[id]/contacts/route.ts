import type { NextRequest } from "next/server";
import { listChildren, addChild } from "@/lib/customers/children";

export const dynamic = "force-dynamic";

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  return listChildren("persons", params.id);
}
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  return addChild("persons", params.id, request);
}
