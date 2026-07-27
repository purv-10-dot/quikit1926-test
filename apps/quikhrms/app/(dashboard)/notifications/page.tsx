"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useApiClient } from "@/lib/hooks/use-api";
import { Bell, CheckCheck, Info, AlertTriangle, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import { clsx } from "clsx";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";

interface Notif { id: string; type: string; title: string; message: string; link: string | null; isRead: boolean; createdAt: string; entityType: string | null; entityId: string | null; }

const icons: Record<string, React.ReactNode> = {
  Info: <Info size={14} className="text-[#22c55e]" />,
  Warning: <AlertTriangle size={14} className="text-yellow-500" />,
  Success: <CheckCircle size={14} className="text-green-500" />,
  Error: <XCircle size={14} className="text-red-500" />,
  Action: <ArrowRight size={14} className="text-purple-500" />,
};

export default function NotificationCenterPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications", "all"],
    queryFn: () => api.get<Notif[]>("/api/v1/hrms/notifications?limit=100"),
  });

  const { data: unread } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<{ count: number }>("/api/v1/hrms/notifications/unread-count"),
  });

  const readOneMut = useMutation({
    mutationFn: (id: string) => api.put(`/api/v1/hrms/notifications/${id}/read`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const handleOpen = (n: Notif) => {
    if (!n.isRead) readOneMut.mutate(n.id);
    if (n.link) router.push(n.link);
  };

  const readAllMut = useMutation({
    mutationFn: () => api.put("/api/v1/hrms/notifications/read-all", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const notifs = data?.data ?? [];
  const unreadCount = unread?.data.count ?? 0;

  return (
    <div className="max-w-3xl">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Bell className="text-[#22c55e]" />
          <h1 className="text-page-title text-gray-900">Notifications</h1>
          {unreadCount > 0 && <span className="px-2 py-0.5 bg-red-500 text-white rounded-full text-xs font-medium">{unreadCount}</span>}
        </div>
        {unreadCount > 0 && (
          <button onClick={() => readAllMut.mutate()} className="flex items-center gap-1 text-sm text-[#22c55e] hover:underline">
            <CheckCheck size={14} /> Mark all read
          </button>
        )}
      </div>

      {isLoading ? <SkeletonCards count={4} /> : notifs.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <Bell size={32} className="mx-auto mb-2 text-gray-300" /> No notifications
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 divide-y divide-gray-100">
          {notifs.map((n, i) => (
            <div
              key={n.id}
              onClick={() => handleOpen(n)}
              className={clsx("row-stagger p-4 flex items-start gap-3 cursor-pointer hover:bg-gray-50", !n.isRead && "bg-[#dcfce7]/30")}
              style={{ ["--i" as never]: Math.min(i, 10) }}
            >
              <div className="mt-0.5">{icons[n.type] ?? <Bell size={14} />}</div>
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  <h3 className={clsx("text-sm", !n.isRead ? "font-semibold text-gray-900" : "text-gray-700")}>{n.title}</h3>
                  {!n.isRead && <span className="w-2 h-2 bg-green-500 rounded-full" />}
                </div>
                <p className="text-sm text-gray-600 mt-0.5">{n.message}</p>
                <div className="flex items-center gap-3 mt-2 text-xs text-gray-400">
                  <span>{new Date(n.createdAt).toLocaleString("en-IN")}</span>
                  {n.link && <span className="text-[#22c55e]">Open →</span>}
                </div>
              </div>
              {!n.isRead && (
                <button
                  onClick={(ev) => { ev.stopPropagation(); readOneMut.mutate(n.id); }}
                  className="text-xs text-[#22c55e] hover:underline"
                >
                  Mark read
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
