"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { clsx } from "clsx";
import { Bell, CheckCheck, Info, AlertTriangle, CheckCircle, XCircle, ArrowRight } from "lucide-react";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { PageBackground } from "@/components/hrms/page-background";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

const typeIcons: Record<string, React.ReactNode> = {
  Info: <Info size={14} className="text-[#22c55e]" />,
  Warning: <AlertTriangle size={14} className="text-yellow-500" />,
  Success: <CheckCircle size={14} className="text-green-500" />,
  Error: <XCircle size={14} className="text-red-500" />,
  Action: <ArrowRight size={14} className="text-purple-500" />,
};

export default function NotificationsPage() {
  const api = useApiClient();
  const qc = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ["notifications"],
    queryFn: () => api.get<NotificationItem[]>("/api/v1/hrms/notifications?limit=100"),
  });

  const markAllMut = useMutation({
    mutationFn: () => api.patch("/api/v1/hrms/notifications", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const notifications = data?.data ?? [];
  const unreadCount = notifications.filter((n) => !n.isRead).length;

  return (
    <div className="max-w-2xl mx-auto">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h1 className="text-base font-semibold text-gray-900">Notifications</h1>
          {unreadCount > 0 && <span className="bg-green-600 text-white text-[11px] font-medium px-2 py-0.5 rounded-full">{unreadCount}</span>}
        </div>
        {unreadCount > 0 && (
          <button onClick={() => markAllMut.mutate()}
            className="flex items-center gap-1 text-xs font-medium text-[#22c55e] hover:underline">
            <CheckCheck size={13} /> Mark all read
          </button>
        )}
      </div>

      {isLoading ? <SkeletonCards count={4} /> : notifications.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <Bell size={32} className="mx-auto mb-2 text-gray-300" />No notifications
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map((n) => (
            <div key={n.id} className={clsx("bg-white rounded-lg border p-3 flex items-start gap-3", n.isRead ? "border-gray-200" : "border-[#bbf7d0] bg-[#dcfce7]/30")}>
              <div className="mt-0.5">{typeIcons[n.type] ?? typeIcons.Info}</div>
              <div className="flex-1">
                <p className={clsx("text-[13px]", n.isRead ? "text-gray-700" : "text-gray-900 font-medium")}>{n.title}</p>
                <p className="text-xs text-gray-500 mt-0.5">{n.message}</p>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(n.createdAt).toLocaleString("en-IN", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
              {!n.isRead && <div className="w-2 h-2 rounded-full bg-[#dcfce7]0 mt-2 flex-shrink-0" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
