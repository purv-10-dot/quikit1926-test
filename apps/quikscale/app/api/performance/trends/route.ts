import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";

export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) return NextResponse.json({ success: false, error: "Unauthorized" }, { status: 401 });

    const user = await db.user.findUnique({ where: { id: session.user.id }, include: { memberships: true } });
    const tenantId = user?.memberships[0]?.tenantId;
    if (!tenantId) return NextResponse.json({ success: false, error: "No tenant" }, { status: 400 });

    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear];
    const quarters = ["Q1", "Q2", "Q3", "Q4"];

    const kpis = await db.kPI.findMany({ where: { tenantId } });
    const priorities = await db.priority.findMany({ where: { tenantId }, include: { weeklyStatuses: true } });

    const quarterlyData = years.flatMap(year =>
      quarters.map(quarter => {
        const qKpis = kpis.filter(k => k.year === year && k.quarter === quarter);
        const qPriorities = priorities.filter(p => p.year === year && p.quarter === quarter);
        const kpiAtt = qKpis.length > 0 ? Math.round(qKpis.reduce((s, k) => s + (k.progressPercent || 0), 0) / qKpis.length) : null;
        const completed = qPriorities.filter(p => p.overallStatus === "completed").length;
        const priorityRate = qPriorities.length > 0 ? Math.round((completed / qPriorities.length) * 100) : null;
        return { year, quarter, label: `${quarter} ${year}`, kpiAttainment: kpiAtt, priorityRate, kpiCount: qKpis.length, priorityCount: qPriorities.length };
      })
    );

    // Weekly KPI trend for current quarter
    const currentQuarter = Math.ceil((new Date().getMonth() + 1) / 3);
    const qLabel = `Q${currentQuarter}`;
    const currentQKpis = await db.kPI.findMany({
      where: { tenantId, year: currentYear, quarter: qLabel },
      include: { weeklyValues: true }
    });

    const weeklyTrend = Array.from({ length: 13 }, (_, i) => {
      const week = i + 1;
      const values = currentQKpis.flatMap(k => k.weeklyValues.filter(v => v.weekNumber === week && v.value !== null));
      return { week, avgValue: values.length > 0 ? Math.round(values.reduce((s, v) => s + (v.value || 0), 0) / values.length) : null, count: values.length };
    });

    return NextResponse.json({ success: true, data: { quarterlyData, weeklyTrend } });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
