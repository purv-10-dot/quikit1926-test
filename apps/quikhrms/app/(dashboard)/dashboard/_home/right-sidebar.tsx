"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { clsx } from "clsx";
import {
  Clock, Square, Pin,
  Calendar as CalendarIcon, FileText as FileIcon,
  Wallet, UserCircle, Network, ShieldCheck,
  Megaphone, Users as UsersIcon, Sparkles, PartyPopper, Cake, Award,
  Home, Palmtree, Receipt,
} from "lucide-react";

interface AttendanceToday {
  checkedIn: boolean;
  elapsedSeconds: number;
}

export function AttendanceWidget() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const { data } = useQuery({
    queryKey: ["attendance-today"],
    queryFn: () => api.get<AttendanceToday>("/api/v1/hrms/attendance/today"),
    staleTime: 30_000,
  });
  const att = data?.data;
  const isWorking = att?.checkedIn ?? false;

  const [liveSeconds, setLiveSeconds] = useState(0);
  useEffect(() => {
    if (!isWorking) { setLiveSeconds(att?.elapsedSeconds ?? 0); return; }
    setLiveSeconds(att?.elapsedSeconds ?? 0);
    const t = setInterval(() => setLiveSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [isWorking, att?.elapsedSeconds]);

  const invalidateAttendance = () => {
    qc.invalidateQueries({ queryKey: ["attendance-today"] });
    qc.invalidateQueries({ queryKey: ["attendance-week"] });
  };

  const checkInMut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/attendance/check-in", { source: "Web" }),
    onSuccess: () => { toast.success("Clocked in"); invalidateAttendance(); },
  });
  const checkOutMut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/attendance/check-out", {}),
    onSuccess: () => { toast.success("Clocked out"); invalidateAttendance(); },
  });

  const hours = Math.floor(liveSeconds / 3600);
  const minutes = Math.floor((liveSeconds % 3600) / 60);
  const seconds = liveSeconds % 60;

  return (
    <div className="surface-card p-4">
      <h3 className="text-[13px] font-semibold text-gray-900">Today&apos;s attendance</h3>
      <div className="text-center mt-3">
        <p className="font-serif-display text-3xl font-bold text-gray-900 tracking-tight">
          {hours}h <span className="text-gray-400">{String(minutes).padStart(2, "0")}m</span> <span className="text-gray-400 text-xl">{String(seconds).padStart(2, "0")}s</span>
        </p>
        <p className="text-xs text-gray-500 mt-1">Hours worked</p>
      </div>
      <button
        onClick={() => (isWorking ? checkOutMut.mutate() : checkInMut.mutate())}
        disabled={checkInMut.isPending || checkOutMut.isPending}
        className={clsx(
          "w-full mt-3 inline-flex items-center justify-center gap-2 px-4 py-3 rounded-2xl text-xs font-medium transition disabled:opacity-60",
          isWorking ? "bg-red-600 hover:bg-red-700 text-white" : "bg-green-600 hover:bg-green-700 text-white",
        )}
      >
        {isWorking ? <><Square size={13} fill="currentColor" /> Clock out</> : <><Clock size={13} /> Clock in</>}
      </button>
    </div>
  );
}

const QUICK_ACTIONS = [
  { label: "Mark attendance", icon: <Clock size={18} />, href: "/attendance", bg: "bg-amber-50", color: "text-amber-600" },
  { label: "Apply leave", icon: <Palmtree size={18} />, href: "/leaves", bg: "bg-green-50", color: "text-green-600" },
  { label: "Apply WFH", icon: <Home size={18} />, href: "/wfh/my-requests", bg: "bg-violet-50", color: "text-violet-600" },
  { label: "View payslip", icon: <FileIcon size={18} />, href: "/payroll/my-payslips", bg: "bg-sky-50", color: "text-sky-600" },
  { label: "Expense claim", icon: <Receipt size={18} />, href: "/expenses", bg: "bg-teal-50", color: "text-teal-600" },
  { label: "Company directory", icon: <UsersIcon size={18} />, href: "/org-chart", bg: "bg-indigo-50", color: "text-indigo-600" },
];

export function EssentialsWidget() {
  // All six shortcuts always show, same as before — a role without access to
  // one just lands on the "Access restricted" page (RouteGuard) on click,
  // instead of the tile silently vanishing.
  const items = QUICK_ACTIONS;

  return (
    <div className="surface-card p-4">
      <h3 className="text-[13px] font-semibold text-gray-900 mb-4">Quick actions</h3>
      <div className="grid grid-cols-3 gap-3">
        {items.map((it) => (
          <Link
            key={it.label}
            href={it.href}
            className="flex flex-col items-center justify-center gap-2 rounded-xl border border-gray-100 bg-white hover:border-green-200 hover:bg-green-50/40 px-2 py-3.5 text-center transition group"
          >
            <span className={clsx("w-10 h-10 rounded-full flex items-center justify-center transition", it.bg, it.color)}>
              {it.icon}
            </span>
            <span className="text-[11px] font-medium text-gray-700 group-hover:text-green-700 leading-tight">
              {it.label}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}

interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  publishedAt: string | null;
  author: { firstName: string; lastName: string; profilePhoto: string | null } | null;
}

interface Notif {
  id: string;
  entityType: string | null;
  entityId: string | null;
  isRead: boolean;
  createdAt: string;
}

export function AnnouncementsWidget() {
  const api = useApiClient();
  const { data } = useQuery({
    queryKey: ["home", "announcements-sidebar"],
    // Latest announcements (most recent first), regardless of the active/expiry
    // window — mirrors what the "View all" list shows. Scrolls within the card.
    queryFn: () => api.get<AnnouncementItem[]>("/api/v1/hrms/engage/announcements?limit=10"),
    staleTime: 60_000,
  });
  const { data: unreadData } = useQuery({
    queryKey: ["home", "announcement-unread"],
    queryFn: () => api.get<Notif[]>("/api/v1/hrms/notifications?limit=20&unread=true"),
    staleTime: 30_000,
  });
  const items = data?.data ?? [];
  const count = data?.meta?.total ?? items.length;
  const unreadAnnouncements = (unreadData?.data ?? []).filter((n) => n.entityType === "Announcement").length;

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-semibold text-gray-900">Announcements</h3>
          {unreadAnnouncements > 0 && (
            <span className="min-w-[18px] h-[18px] px-1.5 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
              {unreadAnnouncements > 9 ? "9+" : unreadAnnouncements}
            </span>
          )}
        </div>
        <Link href="/engage/announcements" className="text-xs font-medium text-green-600 hover:text-green-700">
          View all
        </Link>
      </div>

      {items.length === 0 ? (
        <div className="py-6 text-center text-xs text-gray-500">No announcements</div>
      ) : (
        <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1 -mr-1">
          {items.map((a) => {
            const tile = pickAnnouncementTile(a.title);
            return (
              <Link
                key={a.id}
                href="/engage/announcements"
                className="flex items-start gap-3 group"
              >
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${tile.bg}`}>
                  <tile.Icon size={18} className={tile.color} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-start gap-1.5">
                    {a.isPinned && <Pin size={11} className="text-amber-500 mt-1 shrink-0" />}
                    <p className="text-[13px] font-semibold text-gray-900 leading-snug group-hover:text-green-700 transition-colors">
                      {a.title}
                    </p>
                  </div>
                  <p className="text-[11px] text-gray-500 mt-1 leading-relaxed line-clamp-2">{a.content}</p>
                  {a.publishedAt && (
                    <p className="text-[10px] text-gray-400 mt-1.5">
                      {new Date(a.publishedAt).toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
                      {a.author && ` · ${a.author.firstName} ${a.author.lastName}`}
                    </p>
                  )}
                </div>
              </Link>
            );
          })}
        </div>
      )}

      {count > items.length && (
        <Link
          href="/engage/announcements"
          className="block text-center text-[11px] font-medium text-green-600 hover:text-green-700 pt-3 mt-2 border-t border-gray-100"
        >
          +{count - items.length} more
        </Link>
      )}
    </div>
  );
}

function pickAnnouncementTile(title: string): {
  Icon: LucideIcon;
  bg: string; color: string;
} {
  const t = title.toLowerCase();
  if (/holiday|leave|calendar/.test(t))   return { Icon: CalendarIcon, bg: "bg-green-50",    color: "text-green-600" };
  if (/all.?hands|town.?hall|meeting/.test(t)) return { Icon: UsersIcon, bg: "bg-orange-50",  color: "text-orange-500" };
  if (/birthday|cake/.test(t))            return { Icon: Cake,         bg: "bg-pink-50",    color: "text-pink-500" };
  if (/celebrate|party|event/.test(t))    return { Icon: PartyPopper,  bg: "bg-amber-50",   color: "text-amber-600" };
  if (/award|kudos|winner/.test(t))       return { Icon: Award,        bg: "bg-emerald-50", color: "text-emerald-600" };
  if (/new|launch|release/.test(t))       return { Icon: Sparkles,     bg: "bg-green-50",  color: "text-green-600" };
  return { Icon: Megaphone, bg: "bg-violet-50", color: "text-violet-600" };
}

