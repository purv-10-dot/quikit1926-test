"use client";

import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { PageBackground } from "@/components/hrms/page-background";
import { EmployeeSelect } from "@/components/hrms/employees/employee-select";
import { Select } from "@/components/hrms/ui/select";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { clsx } from "clsx";
import {
  Plus, Award, Star, Trophy, Megaphone, Sparkles, Heart,
  Search, Send, Globe2, Users, TrendingUp, Crown, Flame,
} from "lucide-react";
import { SkeletonCards } from "@/components/hrms/skeleton";
import { Pagination } from "@/components/hrms/pagination";

interface RecognitionItem {
  id: string;
  type: string;
  message: string;
  badge: string | null;
  points: number;
  isPublic: boolean;
  createdAt: string;
  fromEmployee: { id: string; firstName: string; lastName: string; profilePhoto: string | null };
  toEmployee: { id: string; firstName: string; lastName: string; profilePhoto: string | null; jobTitle: string | null };
}

type RecogType = "Kudos" | "Badge" | "Award" | "Shoutout";

const typeMeta: Record<RecogType, {
  Icon: LucideIcon;
  bg: string; text: string; ring: string; chip: string;
  gradient: string;
  hint: string;
}> = {
  Kudos:    { Icon: Star,      bg: "bg-amber-50",   text: "text-amber-700",   ring: "ring-amber-200",   chip: "bg-amber-100 text-amber-800",   gradient: "from-amber-400 to-orange-500", hint: "Quick thank you" },
  Badge:    { Icon: Award,     bg: "bg-green-50",    text: "text-green-700",    ring: "ring-green-200",    chip: "bg-green-100 text-green-800",     gradient: "from-green-500 to-green-600", hint: "Skill / behavior" },
  Award:    { Icon: Trophy,    bg: "bg-violet-50",  text: "text-violet-700",  ring: "ring-violet-200",  chip: "bg-violet-100 text-violet-800", gradient: "from-violet-500 to-purple-600", hint: "Big achievement" },
  Shoutout: { Icon: Megaphone, bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200", chip: "bg-emerald-100 text-emerald-800", gradient: "from-emerald-500 to-teal-600", hint: "Public callout" },
};

const badges = ["Rising Star", "Team Player", "Innovator", "Go-Getter", "Mentor", "Customer Champion", "Culture Carrier"];

function initials(f: string, l: string) {
  return `${(f?.[0] ?? "").toUpperCase()}${(l?.[0] ?? "").toUpperCase()}`;
}

function timeAgo(iso: string) {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString("en-IN", { day: "2-digit", month: "short" });
}

export default function RecognitionPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | RecogType>("All");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [form, setForm] = useState<{
    toEmployeeId: string;
    type: RecogType;
    message: string;
    badge: string;
    points: number | null;
    isPublic: boolean;
  }>({ toEmployeeId: "", type: "Kudos", message: "", badge: "", points: null, isPublic: true });

  const resetForm = () => setForm({ toEmployeeId: "", type: "Kudos", message: "", badge: "", points: null, isPublic: true });
  const openCreate = () => { resetForm(); setShowCreate(true); };

  const { data, isLoading } = useQuery({
    queryKey: ["recognitions"],
    queryFn: () => api.get<RecognitionItem[]>("/api/v1/hrms/engage/recognition?limit=50"),
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/engage/recognition", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["recognitions"] });
      setShowCreate(false);
      resetForm();
    },
  });

  const recognitions = data?.data ?? [];

  const stats = useMemo(() => {
    const totalPoints = recognitions.reduce((s, r) => s + (r.points ?? 0), 0);
    const weekAgo = Date.now() - 7 * 86400000;
    const thisWeek = recognitions.filter((r) => new Date(r.createdAt).getTime() >= weekAgo).length;
    const recipientCounts = new Map<string, { name: string; count: number; photo: string | null }>();
    recognitions.forEach((r) => {
      const k = r.toEmployee.id;
      const cur = recipientCounts.get(k);
      const name = `${r.toEmployee.firstName} ${r.toEmployee.lastName}`;
      if (cur) cur.count += 1;
      else recipientCounts.set(k, { name, count: 1, photo: r.toEmployee.profilePhoto });
    });
    const topRecipients = Array.from(recipientCounts.entries())
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return { total: recognitions.length, totalPoints, thisWeek, topRecipients };
  }, [recognitions]);

  const filtered = useMemo(() => {
    return recognitions.filter((r) => {
      if (filter !== "All" && r.type !== filter) return false;
      if (search) {
        const q = search.toLowerCase();
        const fromN = `${r.fromEmployee.firstName} ${r.fromEmployee.lastName}`.toLowerCase();
        const toN = `${r.toEmployee.firstName} ${r.toEmployee.lastName}`.toLowerCase();
        return fromN.includes(q) || toN.includes(q) || r.message.toLowerCase().includes(q);
      }
      return true;
    });
  }, [recognitions, filter, search]);
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const pageItems = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const meta = typeMeta[form.type];

  return (
    <div>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      {/* Hero */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#3F1A56] via-[#7C2D92] to-[#C026D3] mb-4">
        <svg className="absolute inset-0 w-full h-full opacity-50" viewBox="0 0 1200 200" preserveAspectRatio="none">
          <defs>
            <radialGradient id="rec-glow" cx="0.85" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#f0abfc" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#7C2D92" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="1000" cy="100" rx="280" ry="180" fill="url(#rec-glow)" />
          <g stroke="#f5d0fe" strokeWidth="1" fill="none" opacity="0.35">
            <path d="M 500 80 Q 700 40 900 80 T 1300 80" />
            <path d="M 480 110 Q 700 70 920 110 T 1300 110" />
            <path d="M 460 140 Q 700 100 940 140 T 1300 140" />
          </g>
        </svg>
        <div className="relative px-6 py-7 flex items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm ring-1 ring-white/20 text-[11px] font-bold tracking-widest text-white/90 uppercase">
              <Trophy size={12} /> Recognition wall
            </div>
            <h1 className="font-serif-display text-white text-base font-semibold mt-3">
              Celebrate great work
            </h1>
            <p className="text-white/80 text-xs mt-1">A small nod goes a long way. Send kudos, hand out badges, give shoutouts.</p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white text-[#3F1A56] text-xs font-medium shadow-lg hover:shadow-xl transition-shadow shrink-0"
          >
            <Plus size={13} /> <span className="hidden sm:inline">Give recognition</span><span className="sm:hidden">Give</span>
          </button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatCard iconBg="bg-amber-50" iconColor="text-amber-600" Icon={Trophy} label="Total kudos" value={stats.total} caption="On the wall" />
        <StatCard iconBg="bg-emerald-50" iconColor="text-emerald-600" Icon={Flame} label="This week" value={stats.thisWeek} caption="Last 7 days" />
        <StatCard iconBg="bg-violet-50" iconColor="text-violet-600" Icon={Sparkles} label="Points awarded" value={stats.totalPoints} caption="Across all kudos" />
        <StatCard iconBg="bg-rose-50" iconColor="text-rose-500" Icon={Heart} label="People recognised" value={stats.topRecipients.length} caption="Unique recipients" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Filter bar */}
          <div className="surface-card p-3 flex items-center gap-3 flex-wrap">
            <div className="relative flex-1 min-w-[200px]">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search recognitions..."
                value={search}
                onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                className="w-full pl-9 pr-3 py-2 border border-[var(--border)] rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-violet-500"
              />
            </div>
            <div className="flex items-center gap-1 bg-gray-50 rounded-lg p-1 flex-wrap">
              {(["All", "Kudos", "Badge", "Award", "Shoutout"] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => { setFilter(f); setPage(1); }}
                  className={`px-3 py-1.5 rounded-md text-[13px] font-semibold transition-colors ${
                    filter === f ? "bg-white text-[#3F1A56] shadow-sm" : "text-gray-500 hover:text-gray-700"
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>

          {/* Feed */}
          {isLoading ? (
            <SkeletonCards count={4} />
          ) : filtered.length === 0 ? (
            <div className="surface-card p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-violet-50 flex items-center justify-center mx-auto mb-3">
                <Trophy size={24} className="text-violet-600" />
              </div>
              <p className="font-serif-display text-[13px] font-semibold text-gray-900">No recognitions yet</p>
              <p className="text-xs text-gray-500 mt-1">{search || filter !== "All" ? "Try a different filter." : "Be the first to celebrate someone."}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pageItems.map((r, idx) => {
                const m = typeMeta[r.type as RecogType] ?? typeMeta.Kudos;
                const TIcon = m.Icon;
                return (
                  <article
                    key={r.id}
                    className="row-stagger card-hover-lift surface-card p-4"
                    style={{ ["--i" as never]: Math.min(idx, 10) }}
                  >
                    <div className="flex items-start gap-3">
                      <Avatar emp={r.fromEmployee} size="md" />

                      <div className="min-w-0 flex-1">
                        {/* Header line */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="text-[13px] leading-snug min-w-0">
                            <span className="font-bold text-gray-900">{r.fromEmployee.firstName} {r.fromEmployee.lastName}</span>
                            <span className="text-gray-500"> recognised </span>
                            <span className="font-bold text-gray-900">{r.toEmployee.firstName} {r.toEmployee.lastName}</span>
                            {r.toEmployee.jobTitle && <span className="text-gray-400"> · {r.toEmployee.jobTitle}</span>}
                          </div>
                          <span className="text-[11px] text-gray-400 shrink-0">{timeAgo(r.createdAt)}</span>
                        </div>

                        {/* Chips */}
                        <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider ${m.bg} ${m.text}`}>
                            <TIcon size={10} /> {r.type}
                          </span>
                          {r.badge && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-600">
                              <Award size={10} /> {r.badge}
                            </span>
                          )}
                          {r.points > 0 && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-amber-600 font-semibold">
                              <Sparkles size={9} /> +{r.points} pts
                            </span>
                          )}
                        </div>

                        {/* Message */}
                        <p className="text-xs text-gray-700 mt-2.5 leading-relaxed">{r.message}</p>

                        {/* To employee chip */}
                        <div className="mt-3 inline-flex items-center gap-2 px-2.5 py-1.5 rounded-lg bg-gray-50 ring-1 ring-gray-100">
                          <Avatar emp={r.toEmployee} size="xs" />
                          <span className="text-xs font-semibold text-gray-700">For {r.toEmployee.firstName}</span>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
              <Pagination page={page} totalPages={totalPages} total={filtered.length} limit={PAGE_SIZE} onPageChange={setPage} className="border-t-0 px-0" />
            </div>
          )}
        </div>

        {/* Sidebar */}
        <aside className="space-y-4">
          {/* Leaderboard */}
          <div className="surface-card p-4">
            <h3 className="text-[13px] font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Crown size={14} className="text-amber-500" /> Most recognised
            </h3>
            {stats.topRecipients.length === 0 ? (
              <p className="text-xs text-gray-500">No one yet. Be the first to give.</p>
            ) : (
              <ul className="space-y-2.5">
                {stats.topRecipients.map((p, i) => (
                  <li key={p.id} className="flex items-center gap-3">
                    <div className={clsx(
                      "w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold shrink-0",
                      i === 0 && "bg-amber-100 text-amber-700",
                      i === 1 && "bg-gray-100 text-gray-700",
                      i === 2 && "bg-orange-100 text-orange-700",
                      i > 2 && "bg-gray-50 text-gray-500",
                    )}>
                      #{i + 1}
                    </div>
                    <Avatar emp={{ firstName: p.name.split(" ")[0], lastName: p.name.split(" ")[1] ?? "", profilePhoto: p.photo }} size="xs" />
                    <span className="text-[13px] font-semibold text-gray-800 truncate flex-1">{p.name}</span>
                    <span className="text-xs font-bold text-violet-600">{p.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* Type legend */}
          <div className="surface-card p-4">
            <h3 className="text-[13px] font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <TrendingUp size={14} className="text-violet-600" /> Recognition types
            </h3>
            <ul className="space-y-2">
              {(Object.keys(typeMeta) as RecogType[]).map((t) => {
                const m = typeMeta[t];
                const Icon = m.Icon;
                return (
                  <li key={t} className="flex items-center gap-2.5">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center bg-gradient-to-br ${m.gradient} text-white shrink-0`}>
                      <Icon size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-gray-900">{t}</p>
                      <p className="text-[11px] text-gray-500 truncate">{m.hint}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Tips */}
          <div className="surface-card p-4">
            <h3 className="text-[13px] font-semibold text-gray-900 mb-2">Tips</h3>
            <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside">
              <li>Be specific — name what they did and why it mattered.</li>
              <li>Send within a week of the moment.</li>
              <li>Pair points with a badge for bigger wins.</li>
              <li>Public Shoutouts inspire others.</li>
            </ul>
          </div>
        </aside>
      </div>

      {/* Create modal */}
      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="Give recognition"
        subtitle="Catch someone doing great work — call it out."
        headerIcon={<Trophy size={18} />}
        size="lg"
        bodyClassName="p-0 overflow-y-auto"
      >
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form); }}>
          {/* Preview */}
          <div className="px-5 pt-4 pb-4 bg-gradient-to-br from-violet-50/60 via-white to-amber-50/40 border-b border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Preview</p>
            <div className="flex items-start gap-3">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${meta.gradient} flex items-center justify-center text-white shrink-0 shadow-md`}>
                <meta.Icon size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1 ${meta.bg} ${meta.text} ${meta.ring}`}>
                    <meta.Icon size={10} /> {form.type}
                  </span>
                  {form.badge && (
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${meta.chip}`}>
                      <Award size={10} /> {form.badge}
                    </span>
                  )}
                  {form.points && form.points > 0 ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                      <Sparkles size={9} /> +{form.points} pts
                    </span>
                  ) : null}
                </div>
                <p className="text-xs text-gray-700 mt-1.5 leading-snug">
                  {form.message || "Your message will appear here..."}
                </p>
              </div>
            </div>
          </div>

          {/* Form body */}
          <div className="p-4 space-y-4">
            <EmployeeSelect
              label="Recognise"
              required
              value={form.toEmployeeId}
              onChange={(id) => setForm({ ...form, toEmployeeId: id })}
            />

            {/* Type cards */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">Type</label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {(Object.keys(typeMeta) as RecogType[]).map((t) => {
                  const m = typeMeta[t];
                  const Icon = m.Icon;
                  const active = form.type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, type: t })}
                      className={clsx(
                        "flex flex-col items-start gap-1.5 p-3 rounded-xl border-2 text-left transition-all",
                        active ? "border-transparent shadow-md" : "border-gray-200 hover:border-gray-300",
                      )}
                      style={active ? { background: "linear-gradient(135deg, rgba(124,45,146,0.08), rgba(192,38,211,0.08))" } : undefined}
                    >
                      <div className={clsx(
                        "w-8 h-8 rounded-lg flex items-center justify-center",
                        active ? `bg-gradient-to-br ${m.gradient} text-white` : "bg-gray-100 text-gray-500",
                      )}>
                        <Icon size={14} />
                      </div>
                      <span className={clsx("text-[13px] font-semibold", active ? "text-gray-900" : "text-gray-700")}>{t}</span>
                      <span className="text-[10px] text-gray-500 truncate w-full">{m.hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold text-gray-800">Message</label>
                <span className="text-[11px] font-medium text-gray-400">{form.message.length} chars</span>
              </div>
              <textarea
                value={form.message}
                onChange={(e) => setForm({ ...form, message: e.target.value })}
                required
                rows={4}
                placeholder="What did they do? Why does it matter? Be specific."
                className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500 transition-colors resize-none"
              />
            </div>

            {/* Badge + Points */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Badge (optional)</label>
                <Select
                  value={form.badge}
                  onChange={(v) => setForm({ ...form, badge: v })}
                  placeholder="None"
                  options={[{ value: "", label: "None" }, ...badges.map((b) => ({ value: b, label: b }))]}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-gray-800 mb-1.5">Points</label>
                <NumberInput
                  allowDecimal={false}
                  value={form.points}
                  onChange={(v) => setForm({ ...form, points: v })}
                  className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500/30 focus:border-violet-500"
                />
              </div>
            </div>

            {/* Public toggle */}
            <button
              type="button"
              onClick={() => setForm({ ...form, isPublic: !form.isPublic })}
              className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border-2 transition-all w-full ${
                form.isPublic ? "border-emerald-400 bg-emerald-50/60" : "border-gray-200 hover:border-gray-300"
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${form.isPublic ? "bg-emerald-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                  {form.isPublic ? <Globe2 size={14} /> : <Users size={14} />}
                </div>
                <div className="text-left min-w-0">
                  <p className="text-[13px] font-semibold text-gray-800">{form.isPublic ? "Public" : "Private"}</p>
                  <p className="text-[11px] text-gray-500 truncate">{form.isPublic ? "Visible on the wall" : "Only sender + recipient"}</p>
                </div>
              </div>
              <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${form.isPublic ? "bg-emerald-500" : "bg-gray-300"}`}>
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.isPublic ? "translate-x-4" : "translate-x-0.5"}`} />
              </span>
            </button>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 bg-gray-50/70 border-t border-gray-100">
            <p className="text-[11px] text-gray-500 hidden sm:block">
              {form.type}
              {form.badge ? ` · ${form.badge}` : ""}
              {form.points && form.points > 0 ? ` · +${form.points} pts` : ""}
              {form.isPublic ? " · public" : " · private"}
            </p>
            <div className="flex items-center gap-2 ml-auto">
              <button
                type="button"
                onClick={() => setShowCreate(false)}
                className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-white"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={createMut.isPending || !form.toEmployeeId || !form.message.trim()}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-[#7C2D92] to-[#C026D3] text-white rounded-lg text-xs font-medium shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send size={13} />
                {createMut.isPending ? "Sending…" : "Send recognition"}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function Avatar({
  emp, size = "md",
}: {
  emp: { firstName: string; lastName: string; profilePhoto: string | null };
  size?: "xs" | "sm" | "md";
}) {
  const sz = size === "xs" ? "w-6 h-6 text-[10px]" : size === "sm" ? "w-8 h-8 text-xs" : "w-10 h-10 text-sm";
  if (emp.profilePhoto) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={emp.profilePhoto} alt="" className={`${sz} rounded-full object-cover`} />;
  }
  return (
    <div className={`${sz} rounded-full bg-gray-200 flex items-center justify-center text-gray-700 font-bold`}>
      {initials(emp.firstName, emp.lastName)}
    </div>
  );
}

function StatCard({
  iconBg, iconColor, Icon, label, value, caption,
}: {
  iconBg: string; iconColor: string;
  Icon: LucideIcon;
  label: string; value: number; caption: string;
}) {
  return (
    <div className="surface-card p-4 flex items-start gap-3">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon size={20} className={iconColor} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-gray-900 truncate">{label}</p>
        <p className="font-serif-display text-xl font-bold text-gray-900 leading-tight mt-0.5">{value}</p>
        <p className="text-[11px] text-gray-500 truncate">{caption}</p>
      </div>
    </div>
  );
}
