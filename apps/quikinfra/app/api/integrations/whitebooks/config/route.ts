import { NextResponse } from "next/server";
import { requireAnyPermission } from "@/lib/auth/context";
import { ok } from "@/lib/http/envelope";
import { PERMISSIONS } from "@/lib/rbac/permissions";
import { isWhitebooksGstVerifyEnabled } from "@/lib/integrations/whitebooks-gst";

export async function GET() {
  const ctxOrResponse = await requireAnyPermission([
    PERMISSIONS.PO_READ,
    PERMISSIONS.PO_WRITE,
    PERMISSIONS.INDENT_READ,
    PERMISSIONS.INDENT_WRITE,
  ]);
  if (ctxOrResponse instanceof NextResponse) return ctxOrResponse;

  return ok({ gstVerifyEnabled: isWhitebooksGstVerifyEnabled() });
}
