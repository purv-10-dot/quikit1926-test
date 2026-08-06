/**
 * POST /api/reports/custom/run — run an ad-hoc custom report.
 */
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireApiUser, isResponse, errorResponse } from "@/lib/auth/require";
import { assertModule } from "@/lib/auth/permissions";
import {
  parseQueryDateRange,
  resolveDefaultDateRange,
} from "@/lib/services/reports/canned/date-ranges";
import { readTzFromCookieHeader } from "@/lib/services/reports/csv-columns";
import { runCustomReport } from "@/lib/services/reports/custom/runner";
import type { CustomReportDefinition } from "@/lib/services/reports/custom/types";

export const runtime = "nodejs";

const filterSchema = z.object({
  field: z.string().min(1).max(64),
  operator: z.enum([
    "equals",
    "not_equals",
    "contains",
    "in",
    "gt",
    "gte",
    "lt",
    "lte",
    "is_empty",
    "is_not_empty",
  ]),
  value: z.string().max(200).optional(),
});

const bodySchema = z.object({
  object: z.enum(["leads", "opportunities", "activities", "callLogs"]),
  groupBy: z.string().min(1).max(64),
  metric: z.enum(["count", "sumAmount", "sumDuration", "avgScore", "sumScore"]),
  title: z.string().max(120).optional(),
  filters: z.array(filterSchema).max(10).optional(),
  chartType: z.enum(["auto", "bar", "line", "pie"]).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  ownerId: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const user = await requireApiUser();
    if (isResponse(user)) return user;
    await assertModule(user, "reports", "view");

    const raw = await req.json().catch(() => null);
    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: "Invalid report definition" },
        { status: 400 },
      );
    }

    const tz = readTzFromCookieHeader(req.headers.get("cookie"));
    const params = new URLSearchParams();
    if (parsed.data.from) params.set("from", parsed.data.from);
    if (parsed.data.to) params.set("to", parsed.data.to);
    const range =
      parseQueryDateRange(params) ?? resolveDefaultDateRange("30d", tz);
    const ownerId =
      parsed.data.ownerId && parsed.data.ownerId.trim()
        ? parsed.data.ownerId.trim()
        : undefined;

    const definition: CustomReportDefinition = {
      object: parsed.data.object,
      groupBy: parsed.data.groupBy,
      metric: parsed.data.metric,
      title: parsed.data.title,
      filters: parsed.data.filters,
      chartType: parsed.data.chartType,
    };

    const result = await runCustomReport(definition, {
      tenantId: user.tenantId,
      session: user,
      from: range.from,
      to: range.to,
      ownerId,
      tz,
    });

    return NextResponse.json({ success: true, data: result });
  } catch (e) {
    return errorResponse(e);
  }
}
