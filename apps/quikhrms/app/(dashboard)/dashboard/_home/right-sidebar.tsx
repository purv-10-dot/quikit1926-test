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
  ClipboardList, Lock, ChevronRight, CheckCircle2,
  Megaphone, Users as UsersIcon, Sparkles, PartyPopper, Cake, Award,
} from "lucide-react";

interface Me {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
  profilePhoto: string | null;
  jobTitle: string | null;
  designation: { title: string } | null;
}

interface AttendanceToday {
  checkedIn: boolean;
  elapsedSeconds: number;
}

export function RightSidebar() {
  return (
    <div className="space-y-4">
      <ProfileCardWidget />
      <AttendanceWidget />
      <EssentialsWidget />
      <SurveysWidget />
      <AnnouncementsWidget />
    </div>
  );
}

export function ProfileCardWidget() {
  const api = useApiClient();
  const { data } = useQuery({
    queryKey: ["me", "right-profile"],
    queryFn: () => api.get<Me>("/api/v1/hrms/employees/me"),
    staleTime: 5 * 60_000,
  });
  const me = data?.data;
  const initials = me ? `${me.firstName[0] ?? ""}${me.lastName[0] ?? ""}`.toUpperCase() : "?";

  return (
    <div className="surface-card p-4 text-center">
      <div className="flex items-center gap-3">
        {me?.profilePhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.profilePhoto} alt="" className="w-14 h-14 rounded-full ring-2 ring-gray-100 object-cover" />
        ) : (
          <div className="w-14 h-14 rounded-full bg-gradient-to-br from-[#22c55e] to-[#16a34a] flex items-center justify-center text-white font-bold">
            {initials}
          </div>
        )}
        <div className="flex-1 min-w-0 text-left">
          <p className="text-[13px] font-semibold text-gray-900 truncate">
            {me ? (me.displayName ?? `${me.firstName} ${me.lastName}`) : "—"}
          </p>
          <Link href={me ? `/employees/${me.id}` : "#"} className="text-xs text-gray-500 hover:text-[#22c55e]">
            Go to my profile
          </Link>
        </div>
      </div>
      <Link href="/leaves/my-leaves" className="w-full mt-4 inline-flex items-center justify-center gap-2 px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-2xl text-xs font-medium transition">
        Request time off
      </Link>
    </div>
  );
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

export function EssentialsWidget() {
  const api = useApiClient();
  // Resolve the real employee id so "My Profile" opens `/employees/<uuid>`,
  // where `isSelf` matches and the Edit button works. The literal `/employees/me`
  // route can't self-match (id "me" !== uuid) so it opens view-only + can't edit.
  const { data: meData } = useQuery({
    queryKey: ["me", "right-profile"],
    queryFn: () => api.get<Me>("/api/v1/hrms/employees/me"),
    staleTime: 5 * 60_000,
  });
  const profileHref = meData?.data?.id ? `/employees/${meData.data.id}` : "/employees/me";

  const items = [
    { label: "Payslip", icon: <Wallet size={18} className="text-gray-700" />, href: "/payroll/my-payslips" },
    { label: "My Profile", icon: <UserCircle size={18} className="text-gray-700" />, href: profileHref },
    { label: "Calendar", icon: <CalendarIcon size={18} className="text-gray-700" />, href: "/holidays" },
    { label: "Documents", icon: <FileIcon size={18} className="text-gray-700" />, href: "/documents/my-vault" },
    { label: "Org Chart", icon: <Network size={18} className="text-gray-700" />, href: "/org-chart?tab=orgchart" },
    { label: "Policies", icon: <ShieldCheck size={18} className="text-gray-700" />, href: "/documents" },
  ];

  return (
    <div className="surface-card p-4">
      <h3 className="text-[13px] font-semibold text-gray-900 mb-4">Essentials</h3>
      <div className="grid grid-cols-4 gap-y-4 gap-x-2">
        {items.map((it) => (
          <Link
            key={it.label}
            href={it.href}
            className="flex flex-col items-center gap-1.5 group"
          >
            <span className="w-12 h-12 rounded-full bg-gray-100 group-hover:bg-green-50 flex items-center justify-center transition">
              {it.icon}
            </span>
            <span className="text-[11px] font-medium text-gray-700 group-hover:text-green-600 transition">
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
    // Top 3 latest announcements (most recent first), regardless of the
    // active/expiry window — mirrors what the "View all" list shows.
    queryFn: () => api.get<AnnouncementItem[]>("/api/v1/hrms/engage/announcements?limit=3"),
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
        <div className="space-y-4">
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

interface MySurvey {
  id: string;
  title: string;
  type: string;
  isAnonymous: boolean;
  endDate: string;
  questionCount: number;
  hasResponded: boolean;
}

export function SurveysWidget() {
  const api = useApiClient();
  const { data } = useQuery({
    queryKey: ["home", "surveys-sidebar"],
    queryFn: () => api.get<MySurvey[]>("/api/v1/hrms/engage/surveys/my"),
    staleTime: 60_000,
  });
  const surveys = data?.data ?? [];
  const pending = surveys.filter((s) => !s.hasResponded);
  const top = pending.slice(0, 3);

  return (
    <div className="surface-card p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-[13px] font-semibold text-gray-900 flex items-center gap-2">
          <ClipboardList size={14} className="text-green-600" /> Surveys
        </h3>
        <div className="flex items-center gap-2">
          {pending.length > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-green-50 text-green-700 text-[11px] font-medium ring-1 ring-green-200">
              {pending.length} pending
            </span>
          )}
          <Link href="/engage/surveys/my" className="text-[11px] font-medium text-green-600 hover:text-green-700 inline-flex items-center gap-0.5">
            View all <ChevronRight size={11} />
          </Link>
        </div>
      </div>

      {pending.length === 0 ? (
        <div className="py-5 text-center">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mx-auto mb-2">
            <CheckCircle2 size={16} className="text-emerald-600" />
          </div>
          <p className="text-xs font-semibold text-gray-700">All caught up</p>
          <p className="text-[11px] text-gray-500 mt-0.5">No surveys waiting on you.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {top.map((s) => {
            const left = Math.max(0, Math.ceil((new Date(s.endDate).getTime() - Date.now()) / 86400000));
            const closingSoon = left <= 3;
            return (
              <Link
                key={s.id}
                href={`/engage/surveys/${s.id}/take`}
                className={`block p-2.5 rounded-lg border transition group ${
                  closingSoon ? "border-amber-200 bg-amber-50/40 hover:bg-amber-50" : "border-gray-100 hover:bg-gray-50"
                }`}
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-lg bg-green-50 flex items-center justify-center shrink-0 group-hover:bg-green-100 transition">
                    <ClipboardList size={14} className="text-green-600" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold text-gray-900 truncate">{s.title}</p>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      <span className="text-[10px] text-gray-500">
                        {s.questionCount} {s.questionCount === 1 ? "Q" : "Qs"}
                      </span>
                      {s.isAnonymous && (
                        <span className="inline-flex items-center gap-0.5 text-[10px] text-gray-400">
                          <Lock size={9} /> anon
                        </span>
                      )}
                      <span className={`text-[10px] font-semibold ${closingSoon ? "text-amber-600" : "text-gray-400"}`}>
                        · {left === 0 ? "closes today" : `${left}d left`}
                      </span>
                    </div>
                  </div>
                  <ChevronRight size={14} className="text-gray-300 shrink-0 group-hover:text-gray-500 transition" />
                </div>
              </Link>
            );
          })}
          {pending.length > 3 && (
            <Link
              href="/engage/surveys/my"
              className="block text-center text-[11px] font-medium text-green-600 hover:text-green-700 pt-1"
            >
              +{pending.length - 3} more
            </Link>
          )}
        </div>
      )}
    </div>
  );
}

