"use client";

import type { LucideIcon } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { withBasePath } from "@/lib/utils/base-path";
import { signOut } from "next-auth/react";
import { clearClientSessionState } from "@/lib/auth/client-cleanup";
import { clsx } from "clsx";
import { AppSwitcher } from "@/components/hrms/layout/app-switcher";
import {
  Search, Bell, BellRing, ChevronDown, CheckCheck,
  User as UserIcon, FolderLock, Settings, DoorOpen, LogOut,
  Info, AlertCircle, CheckCircle2, AlertTriangle, Moon, Sun,
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

/**
 * Global dashboard top bar — search, app switcher, notifications and the user
 * menu. Rendered once by the dashboard layout so it appears on every /hrms
 * page (not just the home dashboard).
 */
export function TopBar() {
  const api = useApiClient();
  const { data } = useQuery({
    queryKey: ["me", "topbar"],
    queryFn: () => api.get<Me>("/api/v1/hrms/employees/me"),
    staleTime: 5 * 60_000,
  });
  const me = data?.data;
  const firstName = me?.displayName?.split(" ")[0] ?? me?.firstName ?? "there";

  // Time-of-day greeting is computed AFTER mount only. `new Date().getHours()`
  // resolves to the server's timezone during SSR but the user's local timezone
  // on the client, so computing it during render produces a server/client text
  // mismatch → hydration error. Render a stable value on the server + initial
  // client paint, then swap in the localized greeting post-hydration.
  const [greeting, setGreeting] = useState("Welcome");
  useEffect(() => {
    const hour = new Date().getHours();
    setGreeting(hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening");
  }, []);

  return (
    <div className="flex items-center justify-between gap-4">
      <h1 className="text-base font-bold text-gray-800">
        {greeting}, {firstName}! <span>👋</span>
      </h1>
      <div className="flex items-center gap-3">
        <div className="relative hidden md:block">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search anything..."
            className="w-64 pl-9 pr-3 py-2 rounded-full text-sm bg-white ring-1 ring-gray-200 focus:ring-blue-300 focus:outline-none placeholder:text-gray-400"
          />
        </div>
        <AppSwitcher />
        <NotificationBell />
        <UserMenu me={me} />
      </div>
    </div>
  );
}

interface NotificationItem {
  id: string;
  type: "Info" | "Success" | "Warning" | "Error";
  title: string;
  message: string;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

const NOTIF_THEME: Record<NotificationItem["type"], { Icon: LucideIcon; bg: string; color: string }> = {
  Info: { Icon: Info, bg: "bg-blue-50", color: "text-blue-600" },
  Success: { Icon: CheckCircle2, bg: "bg-emerald-50", color: "text-emerald-600" },
  Warning: { Icon: AlertTriangle, bg: "bg-amber-50", color: "text-amber-600" },
  Error: { Icon: AlertCircle, bg: "bg-rose-50", color: "text-rose-600" },
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d`;
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

function NotificationBell() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const { data: countRes } = useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: () => api.get<{ count: number }>("/api/v1/hrms/notifications/unread-count"),
    staleTime: 60_000,
  });
  const count = countRes?.data?.count ?? 0;

  const { data: listRes, isLoading } = useQuery({
    queryKey: ["notifications", "list"],
    queryFn: () => api.get<NotificationItem[]>("/api/v1/hrms/notifications?limit=8"),
    enabled: open,
    staleTime: 10_000,
  });
  const items = listRes?.data ?? [];

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const refetch = () => {
    qc.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    qc.invalidateQueries({ queryKey: ["notifications", "list"] });
  };

  type CountRes = { success: true; data: { count: number } };
  type ListRes = { success: true; data: NotificationItem[] };

  const markOneMut = useMutation({
    mutationFn: (id: string) => api.put(`/api/v1/hrms/notifications/${id}/read`, {}),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["notifications", "unread-count"] });
      await qc.cancelQueries({ queryKey: ["notifications", "list"] });
      const prevCount = qc.getQueryData<CountRes>(["notifications", "unread-count"]);
      const prevList = qc.getQueryData<ListRes>(["notifications", "list"]);

      if (prevCount?.data) {
        qc.setQueryData<CountRes>(["notifications", "unread-count"], {
          ...prevCount,
          data: { count: Math.max(0, prevCount.data.count - 1) },
        });
      }
      if (prevList?.data) {
        qc.setQueryData<ListRes>(["notifications", "list"], {
          ...prevList,
          data: prevList.data.map((n) => (n.id === id ? { ...n, isRead: true } : n)),
        });
      }
      return { prevCount, prevList };
    },
    onError: (_e, _id, ctx) => {
      if (ctx?.prevCount) qc.setQueryData(["notifications", "unread-count"], ctx.prevCount);
      if (ctx?.prevList) qc.setQueryData(["notifications", "list"], ctx.prevList);
    },
    onSettled: refetch,
  });

  const markAllMut = useMutation({
    mutationFn: () => api.patch("/api/v1/hrms/notifications", {}),
    onMutate: async () => {
      await qc.cancelQueries({ queryKey: ["notifications", "unread-count"] });
      await qc.cancelQueries({ queryKey: ["notifications", "list"] });
      const prevCount = qc.getQueryData<CountRes>(["notifications", "unread-count"]);
      const prevList = qc.getQueryData<ListRes>(["notifications", "list"]);

      qc.setQueryData<CountRes>(["notifications", "unread-count"], { success: true, data: { count: 0 } } as CountRes);
      if (prevList?.data) {
        qc.setQueryData<ListRes>(["notifications", "list"], {
          ...prevList,
          data: prevList.data.map((n) => ({ ...n, isRead: true })),
        });
      }
      return { prevCount, prevList };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prevCount) qc.setQueryData(["notifications", "unread-count"], ctx.prevCount);
      if (ctx?.prevList) qc.setQueryData(["notifications", "list"], ctx.prevList);
      toast.error("Failed", e.message);
    },
    onSuccess: () => toast.success("All marked as read"),
    onSettled: refetch,
  });

  const onItemClick = (item: NotificationItem) => {
    if (!item.isRead) markOneMut.mutate(item.id);
    setOpen(false);
  };

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative w-9 h-9 rounded-full bg-white ring-1 ring-gray-200 hover:bg-gray-50 flex items-center justify-center text-gray-600"
      >
        {count > 0 ? <BellRing size={16} className="text-blue-600" /> : <Bell size={16} />}
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-1 rounded-full bg-rose-500 text-white text-[10px] font-bold flex items-center justify-center">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute z-50 right-0 top-full mt-2 w-80 bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-[#eff6ff] to-white flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-slate-900">Notifications</p>
              <p className="text-[11px] text-slate-500">{count > 0 ? `${count} unread` : "All caught up"}</p>
            </div>
            {count > 0 && (
              <button
                onClick={() => markAllMut.mutate()}
                disabled={markAllMut.isPending}
                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-700 disabled:opacity-60"
              >
                <CheckCheck size={12} /> Mark all
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-auto">
            {isLoading ? (
              <div className="py-10 text-center text-xs text-gray-500">Loading…</div>
            ) : items.length === 0 ? (
              <div className="py-10 text-center">
                <div className="w-10 h-10 rounded-full bg-gray-100 mx-auto mb-2 flex items-center justify-center">
                  <Bell size={16} className="text-gray-400" />
                </div>
                <p className="text-xs text-gray-500">No notifications yet</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {items.map((n) => {
                  const theme = NOTIF_THEME[n.type] ?? NOTIF_THEME.Info;
                  const Icon = theme.Icon;
                  const body = (
                    <div className={clsx("flex items-start gap-2.5 px-3 py-3 transition", !n.isRead && "bg-blue-50/40", "hover:bg-slate-50")}>
                      <div className={clsx("w-8 h-8 rounded-full flex items-center justify-center shrink-0", theme.bg)}>
                        <Icon size={14} className={theme.color} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className={clsx("text-[13px] truncate", n.isRead ? "text-gray-700" : "font-bold text-gray-900")}>
                          {n.title}
                        </p>
                        <p className="text-[11px] text-gray-500 line-clamp-2 mt-0.5">{n.message}</p>
                        <p className="text-[10px] text-gray-400 mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                      {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-2 shrink-0" />}
                    </div>
                  );
                  return n.link ? (
                    <Link key={n.id} href={n.link} onClick={() => onItemClick(n)}>
                      {body}
                    </Link>
                  ) : (
                    <button key={n.id} onClick={() => onItemClick(n)} className="w-full text-left">
                      {body}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 bg-slate-50">
            <Link
              href="/settings/notifications"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-center text-[12px] font-semibold text-blue-600 hover:bg-slate-100"
            >
              View all notifications
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

function UserMenu({ me }: { me: Me | undefined }) {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  useEffect(() => {
    setDark(document.documentElement.classList.contains("dark"));
  }, []);

  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    localStorage.setItem("hrms.theme", next ? "dark" : "light");
    document.documentElement.classList.toggle("dark", next);
  };

  const initials = me ? `${me.firstName[0] ?? ""}${me.lastName[0] ?? ""}`.toUpperCase() : "?";
  const fullName = me ? (me.displayName ?? `${me.firstName} ${me.lastName}`) : "";
  const subtitle = me?.designation?.title ?? me?.jobTitle ?? "Employee";

  const items = me
    ? [
        { label: "View Profile", href: `/employees/${me.id}`, icon: <UserIcon size={13} /> },
        { label: "My Vault", href: "/documents/my-vault", icon: <FolderLock size={13} /> },
        { label: "Settings", href: "/settings", icon: <Settings size={13} /> },
        { label: "Submit Resignation", href: "/resign", icon: <DoorOpen size={13} /> },
      ]
    : [];

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        disabled={!me}
        className="flex items-center gap-1 rounded-full ring-1 ring-gray-200 hover:bg-gray-50 pr-2 pl-0.5 py-0.5 disabled:opacity-60"
      >
        {me?.profilePhoto ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={me.profilePhoto} alt="" className="w-7 h-7 rounded-full object-cover" />
        ) : (
          <span className="w-7 h-7 rounded-full bg-gradient-to-br from-emerald-500 to-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">
            {initials}
          </span>
        )}
        <ChevronDown size={12} className={clsx("text-gray-500 transition-transform", open && "rotate-180")} />
      </button>

      {open && me && (
        <div className="absolute z-50 right-0 top-full mt-2 w-64 bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-gradient-to-r from-[#eff6ff] to-white">
            <p className="text-sm font-semibold text-slate-900 truncate">{fullName}</p>
            <p className="text-[11px] text-slate-500 truncate">{subtitle}</p>
          </div>
          <div className="py-1">
            {items.map((m) => (
              <Link
                key={m.href}
                href={m.href}
                onClick={() => setOpen(false)}
                className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-slate-50 hover:text-blue-600 transition"
              >
                <span className="text-gray-400">{m.icon}</span>
                {m.label}
              </Link>
            ))}
            <button
              onClick={toggleTheme}
              className="w-full flex items-center justify-between gap-2.5 px-3 py-2 text-[13px] text-gray-700 hover:bg-slate-50 hover:text-blue-600 transition"
            >
              <span className="flex items-center gap-2.5">
                <span className="text-gray-400">{dark ? <Sun size={13} /> : <Moon size={13} />}</span>
                {dark ? "Light mode" : "Dark mode"}
              </span>
              <span
                className={clsx(
                  "relative w-8 h-4 rounded-full transition-colors",
                  dark ? "bg-blue-600" : "bg-gray-300",
                )}
              >
                <span
                  className={clsx(
                    "absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform",
                    dark ? "translate-x-4" : "translate-x-0.5",
                  )}
                />
              </span>
            </button>
          </div>
          <div className="py-1 border-t border-slate-100">
            <button
              onClick={() => {
                setOpen(false);
                // Drop user/tenant-scoped client state (storage, in-flight
                // requests) before the cookie goes — nothing may leak into the
                // next session on a shared machine.
                clearClientSessionState();
                // Central SSO logout — clears the NextAuth session cookie AND
                // revokes the shared Redis session (authOptions signOut event),
                // so the user is logged out of QuikIT + all sibling apps. Land
                // on the public marketing landing page (not /login, which would
                // immediately re-trigger SSO sign-in).
                signOut({ callbackUrl: withBasePath("/") });
              }}
              className="w-full flex items-center gap-2.5 px-3 py-2 text-[13px] text-red-600 hover:bg-red-50 transition"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
