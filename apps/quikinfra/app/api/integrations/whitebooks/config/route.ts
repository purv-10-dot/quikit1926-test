import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/auth/context";
import { ok } from "@/lib/http/envelope";
import {
  isWhitebooksGstVerifyEnabled,
  VENDOR_PICKER_PERMISSIONS,
} from "@/lib/integrations/whitebooks-gst";

export async function GET() {
  const ctxOrResponse = await requireAnyPermission(VENDOR_PICKER_PERMISSIONS);
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;

  return ok({ gstVerifyEnabled: isWhitebooksGstVerifyEnabled() });
}
