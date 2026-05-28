"use client";

import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Users, CalendarCheck, HardHat, TrendingUp } from "lucide-react";
import { PageHeader, PageContainer, KPICard } from "@/components/PageShell";

export default function HRMSPage() {
  const router = useRouter();

  const { data: attResult } = useQuery({
    queryKey: ["hrms-attendance"],
    queryFn: () => fetch("/api/hrms/attendance").then(r => r.json()),
  });

  const { data: labResult } = useQuery({
    queryKey: ["hrms-labour"],
    queryFn: () => fetch("/api/hrms/labour").then(r => r.json()),
  });

  const attData = attResult?.data ?? [];
  const labData = labResult?.data ?? [];
  const totalStaff = attData.length;
  const presentToday = attData.filter((a: any) => a.status === "Present").length;
  const labourOnSite = labData.reduce((sum: number, r: any) => sum + (r.total ?? 0), 0);
  const avgAttendance = totalStaff > 0 ? Math.round((presentToday / totalStaff) * 100) : 0;

  return (
    <>
      <PageHeader
        title="HRMS / Labour"
        subtitle="Attendance tracking, labour deployment, and workforce management"
      />
      <PageContainer>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <KPICard title="Total Staff" value={totalStaff}
            icon={<Users className="w-5 h-5" />} color="blue" />
          <KPICard title="Present Today" value={presentToday}
            icon={<CalendarCheck className="w-5 h-5" />} color="green" />
          <KPICard title="Labour on Site" value={labourOnSite}
            icon={<HardHat className="w-5 h-5" />} color="orange" />
          <KPICard title="Avg Attendance %" value={`${avgAttendance}%`}
            icon={<TrendingUp className="w-5 h-5" />} color="purple" />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 gap-4 mt-6">
          {[
            { label: "Attendance", href: "/hrms/attendance", icon: CalendarCheck, color: "bg-green-50 text-green-600", desc: "Daily attendance register for site staff" },
            { label: "Labour Register", href: "/hrms/labour", icon: HardHat, color: "bg-orange-50 text-orange-600", desc: "Daily labour deployment by trade and contractor" },
          ].map((m) => (
            <button key={m.href} onClick={() => router.push(m.href)}
              className="flex flex-col p-5 rounded-xl bg-white border border-gray-200 shadow-sm hover:shadow-md hover:border-gray-300 transition-all text-left">
              <div className={`w-10 h-10 rounded-lg ${m.color} flex items-center justify-center mb-3`}>
                <m.icon className="w-5 h-5" />
              </div>
              <p className="text-sm font-semibold text-gray-900">{m.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{m.desc}</p>
            </button>
          ))}
        </div>
      </PageContainer>
    </>
  );
}
