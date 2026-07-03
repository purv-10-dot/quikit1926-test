import type { NextRequest } from "next/server";
import { requireApiContext } from "@/lib/api/auth";
import { fail, ok } from "@/lib/api/responses";
import { fallbackDashboard } from "@/lib/dashboard-data";
import { getReportConfig } from "@/lib/reports";

export function createReportHandler(reportKey: string) {
  return async (_request: NextRequest) => {
    const auth = await requireApiContext();
    if (!auth.ok) {
      return fail(auth.status, { code: auth.code, message: auth.message });
    }

    return ok(getReportConfig(reportKey));
  };
}

export async function dashboardHandler(_request: NextRequest) {
  const auth = await requireApiContext();
  if (!auth.ok) {
    return fail(auth.status, { code: auth.code, message: auth.message });
  }

  return ok(fallbackDashboard);
}
