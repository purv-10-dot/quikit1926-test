"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDialog } from "@/components/hrms/dialog";
import { useRouter } from "next/navigation";
import {
  Plus, Search, BarChart3, MoreVertical, Copy, Trash2, X,
  Users, Star, BadgeCheck, DollarSign, UserPlus,
  LayoutDashboard, Sparkles, Wand2, ArrowRight, Hash,
} from "lucide-react";
import { clsx } from "clsx";

// Curated icon registry — keeps lucide tree-shakeable. Add to this map when a
// template seed introduces a new iconName (see lib/services/dashboard-templates.ts).
const DASHBOARD_ICONS: Record<string, LucideIcon> = {
  BarChart3, Users, Star, BadgeCheck, DollarSign, UserPlus,
};

interface Dashboard {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  iconName: string | null;
  color: string | null;
  isPrebuilt: boolean;
  widgets: { id: string; type: string; title: string }[];
  createdAt: string;
}

type TabKey = "all" | "prebuilt" | "custom";

export default function DashboardsLandingPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<TabKey>("all");

  const { data, isLoading } = useQuery({
    queryKey: ["dashboards", "all"],
    queryFn: () => api.get<Dashboard[]>("/api/v1/hrms/dashboards"),
  });
  const seedMut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/dashboards/seed-prebuilt", {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboards", "all"] }),
  });

  const items = data?.data ?? [];
  useEffect(() => {
    if (!isLoading && items.length === 0) seedMut.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLoading, items.length]);

  const prebuiltCount = items.filter((d) => d.isPrebuilt).length;
  const customCount = items.filter((d) => !d.isPrebuilt).length;
  const widgetCount = items.reduce((s, d) => s + (d.widgets?.length ?? 0), 0);

  const searched = items.filter((d) => !search || d.name.toLowerCase().includes(search.toLowerCase()));
  const filtered = searched.filter((d) => {
    if (tab === "prebuilt") return d.isPrebuilt;
    if (tab === "custom") return !d.isPrebuilt;
    return true;
  });

  const grouped = useMemo(() => {
    const map = new Map<string, Dashboard[]>();
    for (const d of filtered) {
      const cat = d.isPrebuilt ? "prebuilt" : "custom";
      const arr = map.get(cat) ?? [];
      arr.push(d);
      map.set(cat, arr);
    }
    return map;
  }, [filtered]);

  return (
    <div className="w-full">
      {/* Hero banner */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F1F3D] via-[#14532d] to-[#16a34a] mb-4">
        <svg className="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 1200 200" preserveAspectRatio="none">
          <defs>
            <radialGradient id="db-glow" cx="0.85" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#4ade80" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#14532d" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="1000" cy="100" rx="280" ry="180" fill="url(#db-glow)" />
          <g stroke="#bbf7d0" strokeWidth="1" fill="none" opacity="0.4">
            <path d="M 500 80 Q 700 40 900 80 T 1300 80" />
            <path d="M 480 110 Q 700 70 920 110 T 1300 110" />
            <path d="M 460 140 Q 700 100 940 140 T 1300 140" />
          </g>
        </svg>

        <div className="relative px-6 py-7 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div className="min-w-0">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm ring-1 ring-white/20 text-[11px] font-bold tracking-widest text-white/90 uppercase">
              <LayoutDashboard size={12} /> Dashboards
            </div>
            <h1 className="font-serif-display text-white text-base font-semibold mt-3">
              Discover your org&apos;s story in numbers
            </h1>
            <p className="text-white/75 text-xs mt-1.5 max-w-xl">
              Pre-built views to explore hiring, growth and finance — or build your own.
            </p>

            {/* Inline stat strip */}
            <div className="mt-5 flex flex-wrap gap-2.5">
              <HeroStat label="Total" value={items.length} icon={<LayoutDashboard size={12} />} />
              <HeroStat label="Pre-built" value={prebuiltCount} icon={<Sparkles size={12} />} />
              <HeroStat label="Custom" value={customCount} icon={<Wand2 size={12} />} />
              <HeroStat label="Widgets" value={widgetCount} icon={<Hash size={12} />} />
            </div>
          </div>

          <div className="shrink-0">
            <CreateDashboardButton variant="hero" />
          </div>
        </div>
      </div>

      {/* Tabs + Search */}
      <div className="flex flex-col-reverse md:flex-row md:items-center justify-between gap-3 mb-4">
        <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-gray-100 self-start">
          <TabPill active={tab === "all"} onClick={() => setTab("all")} label="All" count={items.length} />
          <TabPill active={tab === "prebuilt"} onClick={() => setTab("prebuilt")} label="Pre-built" count={prebuiltCount} />
          <TabPill active={tab === "custom"} onClick={() => setTab("custom")} label="Custom" count={customCount} />
        </div>
        <div className="relative md:w-72">
          <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search dashboards…"
            className="w-full pl-8 pr-3 py-2 text-xs bg-white border border-gray-300 rounded-full focus:outline-none focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534] transition"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="py-16 text-center text-xs text-gray-500">Loading…</div>
      ) : filtered.length === 0 && search ? (
        <EmptySearchState query={search} onClear={() => setSearch("")} />
      ) : (
        <div className="space-y-5">
          {(tab === "all" || tab === "prebuilt") && grouped.has("prebuilt") && (
            <Section
              title="Pre-built by Quikit"
              subtitle="Curated dashboards covering the most common HR analytics"
              icon={<Sparkles size={13} className="text-green-600" />}
              count={grouped.get("prebuilt")!.length}
              dashboards={grouped.get("prebuilt")!}
            />
          )}
          {(tab === "all" || tab === "custom") && (
            grouped.has("custom") ? (
              <Section
                title="Your dashboards"
                subtitle="Custom dashboards you've created for your team"
                icon={<Wand2 size={13} className="text-purple-600" />}
                count={grouped.get("custom")!.length}
                dashboards={grouped.get("custom")!}
              />
            ) : tab === "custom" ? (
              <CustomEmptyState />
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

function HeroStat({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white/10 backdrop-blur-sm ring-1 ring-white/15">
      <span className="text-white/70">{icon}</span>
      <span className="text-white text-sm font-bold tabular-nums">{value}</span>
      <span className="text-white/60 text-[11px] font-medium">{label}</span>
    </div>
  );
}

function TabPill({ active, onClick, label, count }: { active: boolean; onClick: () => void; label: string; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={clsx(
        "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-semibold transition",
        active
          ? "bg-white text-[#166534] shadow-sm ring-1 ring-gray-200"
          : "text-gray-600 hover:text-[#166534] hover:bg-white/60",
      )}
    >
      {label}
      <span className={clsx(
        "px-1.5 py-0.5 rounded-full text-[11px] font-semibold tabular-nums",
        active ? "bg-green-600 text-white" : "bg-gray-200 text-gray-600",
      )}>
        {count}
      </span>
    </button>
  );
}

function Section({
  title, subtitle, icon, count, dashboards,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
  count: number;
  dashboards: Dashboard[];
}) {
  return (
    <section>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {icon}
            <h2 className="text-[13px] font-semibold text-gray-900">{title}</h2>
            <span className="px-2 py-0.5 rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600 tabular-nums">
              {count}
            </span>
          </div>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {dashboards.map((d, i) => <Card key={d.id} dashboard={d} delay={i * 40} />)}
      </div>
    </section>
  );
}

function EmptySearchState({ query, onClear }: { query: string; onClear: () => void }) {
  return (
    <div className="py-16 text-center">
      <div className="w-14 h-14 rounded-full bg-gray-100 mx-auto mb-3 flex items-center justify-center">
        <Search size={22} className="text-gray-400" />
      </div>
      <p className="text-[13px] font-semibold text-gray-900">No dashboards match &quot;{query}&quot;</p>
      <p className="text-xs text-gray-500 mt-1 mb-4">Try a different name or clear the search.</p>
      <button
        type="button"
        onClick={onClear}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg ring-1 ring-gray-200 hover:bg-gray-50 text-xs font-medium text-gray-700 transition"
      >
        <X size={13} /> Clear search
      </button>
    </div>
  );
}

function CustomEmptyState() {
  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Wand2 size={13} className="text-purple-600" />
        <h2 className="text-[13px] font-semibold text-gray-900">Your dashboards</h2>
      </div>
      <div className="rounded-3xl ring-1 ring-dashed ring-gray-300 bg-gradient-to-br from-purple-50/60 to-green-50/60 p-10 text-center">
        <div className="w-14 h-14 rounded-full bg-white ring-1 ring-purple-100 mx-auto mb-3 flex items-center justify-center">
          <Wand2 size={22} className="text-purple-500" />
        </div>
        <h3 className="font-serif-display text-[13px] font-semibold text-gray-900">Build a custom dashboard</h3>
        <p className="text-xs text-gray-600 mt-1 max-w-md mx-auto">
          Mix metrics, charts and tables tailored to how your team works.
        </p>
        <div className="mt-5">
          <CreateDashboardButton variant="cta" />
        </div>
      </div>
    </section>
  );
}

function Card({ dashboard, delay }: { dashboard: Dashboard; delay: number }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const [showMenu, setShowMenu] = useState(false);

  const dupMut = useMutation({
    mutationFn: () => api.post("/api/v1/hrms/dashboards", {
      name: `${dashboard.name} (copy)`,
      description: dashboard.description,
      widgets: dashboard.widgets,
    }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboards", "all"] }),
  });
  const delMut = useMutation({
    mutationFn: () => api.delete(`/api/v1/hrms/dashboards/${dashboard.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dashboards", "all"] }),
  });

  const Icon = DASHBOARD_ICONS[dashboard.iconName ?? "BarChart3"] ?? BarChart3;
  const color = dashboard.color ?? "#22c55e";
  const widgetCount = dashboard.widgets?.length ?? 0;

  return (
    <div
      className="group relative rounded-2xl bg-white ring-1 ring-gray-200 overflow-hidden transition-all duration-200 hover:ring-gray-300 hover:shadow-xl hover:-translate-y-0.5 animate-in fade-in slide-in-from-bottom-2"
      style={{ animationDelay: `${delay}ms`, animationFillMode: "both" }}
    >
      {/* Floating kebab — always in top-right corner of card */}
      <div className="absolute top-2.5 right-2.5 z-10">
        <button
          type="button"
          onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu((s) => !s); }}
          className="w-8 h-8 rounded-full bg-white/90 hover:bg-white ring-1 ring-black/5 shadow-sm text-gray-500 hover:text-gray-900 flex items-center justify-center transition"
          aria-label="More actions"
        >
          <MoreVertical size={12} />
        </button>
        {showMenu && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setShowMenu(false)} />
            <div
              className="absolute right-0 top-9 z-50 bg-white rounded-xl shadow-2xl ring-1 ring-slate-200 py-1 min-w-[150px] overflow-hidden"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={(e) => { e.preventDefault(); e.stopPropagation(); setShowMenu(false); dupMut.mutate(); }}
                className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-gray-700 hover:bg-gray-50"
              >
                <Copy size={12} /> Duplicate
              </button>
              {!dashboard.isPrebuilt && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    setShowMenu(false);
                    const ok = await dialog.confirm({
                      title: "Delete dashboard?",
                      description: `"${dashboard.name}" and its ${widgetCount} widget${widgetCount === 1 ? "" : "s"} will be permanently removed.`,
                      variant: "danger",
                      confirmLabel: "Delete",
                    });
                    if (ok) delMut.mutate();
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 size={12} /> Delete
                </button>
              )}
            </div>
          </>
        )}
      </div>

      <Link href={`/dashboards/${dashboard.id}`} className="block">
        {/* Slimmer, more interesting hero */}
        <div
          className="relative h-28 overflow-hidden"
          style={{ background: `linear-gradient(135deg, ${color} 0%, ${shade(color, -22)} 100%)` }}
        >
          <div className="absolute inset-0 opacity-[0.10] pointer-events-none" style={{
            backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
            backgroundSize: "14px 14px",
          }} />
          <div className="absolute -right-10 -top-10 w-32 h-32 rounded-full bg-white/15 blur-2xl pointer-events-none" />
          <div className="absolute -left-6 -bottom-6 w-24 h-24 rounded-full bg-black/10 blur-2xl pointer-events-none" />

          <div className="relative h-full flex items-center px-4 gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/15 backdrop-blur-sm ring-1 ring-white/20 flex items-center justify-center shrink-0 group-hover:scale-105 transition-transform">
              <Icon size={26} className="text-white" strokeWidth={1.75} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-white/80 text-[10px] font-bold uppercase tracking-widest">
                {dashboard.category ?? (dashboard.isPrebuilt ? "Pre-built" : "Custom")}
              </p>
              <p className="text-white text-[11px] font-semibold mt-0.5 inline-flex items-center gap-1.5">
                <Hash size={10} className="opacity-80" />
                {widgetCount} {widgetCount === 1 ? "widget" : "widgets"}
              </p>
            </div>
          </div>
        </div>

        {/* Body */}
        <div className="p-4">
          <h3 className="font-serif-display text-[13px] font-semibold text-gray-900 leading-tight truncate">
            {dashboard.name}
          </h3>
          <p className="text-xs text-gray-600 mt-1.5 line-clamp-2 min-h-[2.4em] leading-relaxed">
            {dashboard.description ?? "No description provided."}
          </p>

          {/* Widget type indicators */}
          {widgetCount > 0 && (
            <div className="mt-3 flex items-center gap-1 flex-wrap">
              {Array.from(new Set(dashboard.widgets.map((w) => w.type))).slice(0, 4).map((t) => (
                <span key={t} className="px-1.5 py-0.5 rounded-md bg-gray-100 text-[11px] font-semibold text-gray-600">
                  {t}
                </span>
              ))}
            </div>
          )}

          <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#166534] group-hover:text-[#22c55e] transition">
              Open dashboard <ArrowRight size={12} className="transition-transform group-hover:translate-x-0.5" />
            </span>
            {dashboard.isPrebuilt && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-amber-50 text-amber-700 ring-1 ring-amber-200 text-[11px] font-medium">
                <Sparkles size={9} /> Curated
              </span>
            )}
          </div>
        </div>
      </Link>
    </div>
  );
}

function CreateDashboardButton({ variant = "default" }: { variant?: "default" | "hero" | "cta" }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const createMut = useMutation({
    mutationFn: () => api.post<{ id: string }>("/api/v1/hrms/dashboards", {
      name: name.trim(),
      description: description.trim() || undefined,
      widgets: [],
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["dashboards", "all"] });
      setOpen(false);
      setName("");
      setDescription("");
      if (res?.data?.id) router.push(`/dashboards/${res.data.id}`);
    },
  });

  const triggerClass =
    variant === "hero"
      ? "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white text-[#166534] hover:bg-gray-50 font-medium text-xs shadow-lg ring-1 ring-white/40 transition"
      : variant === "cta"
        ? "inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-green-600 hover:bg-green-700 text-white font-medium text-xs shadow-md transition"
        : "btn btn-primary";

  return (
    <>
      <button onClick={() => setOpen(true)} className={triggerClass}>
        <Plus size={13} /> Add dashboard
      </button>
      {open && (
        <div className="fixed inset-0 z-[100] bg-black/50 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between px-4 py-4 border-b border-gray-100">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-[#166534]/10 text-[#166534] flex items-center justify-center">
                  <LayoutDashboard size={16} />
                </div>
                <div>
                  <h2 className="text-[13px] font-semibold text-gray-900 leading-tight">New dashboard</h2>
                  <p className="text-[11px] text-gray-500">Start blank — add widgets afterwards.</p>
                </div>
              </div>
              <button onClick={() => setOpen(false)} className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg transition">
                <X size={12} />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1.5">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Q4 Headcount"
                  autoFocus
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534] transition"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 uppercase tracking-wide mb-1.5">
                  Description <span className="text-gray-400 normal-case font-normal">(optional)</span>
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  placeholder="What this dashboard shows"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-xs focus:outline-none focus:ring-2 focus:ring-[#166534]/20 focus:border-[#166534] transition resize-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 px-4 py-3 bg-gray-50 border-t border-gray-100">
              <button onClick={() => setOpen(false)} className="px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition">
                Cancel
              </button>
              <button
                onClick={() => createMut.mutate()}
                disabled={!name.trim() || createMut.isPending}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs font-medium rounded-lg disabled:opacity-50 transition"
              >
                {createMut.isPending && <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />}
                {createMut.isPending ? "Creating…" : "Create"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function shade(hex: string, percent: number): string {
  const h = hex.replace("#", "");
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(n.slice(0, 2), 16);
  const g = parseInt(n.slice(2, 4), 16);
  const b = parseInt(n.slice(4, 6), 16);
  const adj = (c: number) => Math.max(0, Math.min(255, Math.round(c + (c * percent) / 100)));
  return `#${[adj(r), adj(g), adj(b)].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}
