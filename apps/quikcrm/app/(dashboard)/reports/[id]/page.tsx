import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require";
import { prisma } from "@/lib/db/prisma";
import { getCannedReport } from "@/lib/services/reports/canned";
import { CannedReportRunner } from "@/components/reports/canned-report-runner";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string; ownerId?: string }>;
};

function defaultRange(): { from: string; to: string } {
  const to = new Date();
  const from = new Date(to.getTime() - 29 * 86400000);
  from.setHours(0, 0, 0, 0);
  return { from: from.toISOString(), to: to.toISOString() };
}

export default async function ReportRunPage({ params, searchParams }: PageProps) {
  const user = await requireUser();
  const { id } = await params;
  const report = getCannedReport(id);
  if (!report) notFound();

  const sp = await searchParams;
  const fallback = defaultRange();
  const from = sp.from || fallback.from;
  const to = sp.to || fallback.to;
  const ownerId = sp.ownerId?.trim() || undefined;

  const memberships = await prisma.orgMember.findMany({
    where: { orgId: user.orgId },
    include: { user: { select: { id: true, firstName: true, lastName: true, email: true } } },
  });
  const ownerOptions = memberships.map((m) => ({
    value: m.user.id,
    label:
      `${m.user.firstName ?? ""} ${m.user.lastName ?? ""}`.trim() ||
      m.user.email ||
      m.user.id,
  }));
  const ownerLabel =
    ownerOptions.find((o) => o.value === ownerId)?.label ?? "All agents";
  const fmtDay = (iso: string) => {
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString();
  };
  const filterCaption = `${fmtDay(from)} → ${fmtDay(to)} · ${ownerLabel}`;

  return (
    <CannedReportRunner
      reportId={report.id}
      title={report.title}
      blurb={report.blurb}
      from={from}
      to={to}
      ownerId={ownerId}
      filterCaption={filterCaption}
    />
  );
}
