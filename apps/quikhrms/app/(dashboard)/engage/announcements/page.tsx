"use client";

import type { LucideIcon } from "lucide-react";
import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { PageBackground } from "@/components/hrms/page-background";
import { todayInput } from "@/lib/utils/date-input";
import { Plus, Pin, Megaphone, Sparkles, Calendar, Globe2, Building2, Users, CalendarClock, Send } from "lucide-react";
import { FilterBar, FilterDivider, FilterPills, FilterSearch } from "@/components/hrms/ui/filter-bar";
import { SkeletonCards } from "@/components/hrms/skeleton";

interface AnnouncementItem {
  id: string;
  title: string;
  content: string;
  isPinned: boolean;
  visibility: string;
  publishedAt: string | null;
  expiresAt?: string | null;
  author: { id: string; firstName: string; lastName: string; profilePhoto: string | null };
}

const visibilityStyles: Record<string, { bg: string; text: string; ring: string }> = {
  Organization: { bg: "bg-green-50", text: "text-green-700", ring: "ring-green-200" },
  Department: { bg: "bg-violet-50", text: "text-violet-700", ring: "ring-violet-200" },
  Team: { bg: "bg-emerald-50", text: "text-emerald-700", ring: "ring-emerald-200" },
};

export default function AnnouncementsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | "Pinned" | "Active">("All");
  const [form, setForm] = useState({ title: "", content: "", isPinned: false, visibility: "Organization" as string, expiresAt: "" });

  const resetForm = () => setForm({ title: "", content: "", isPinned: false, visibility: "Organization", expiresAt: "" });
  const openCreate = () => { resetForm(); setShowCreate(true); };

  const { data, isLoading } = useQuery({
    queryKey: ["announcements"],
    queryFn: () => api.get<AnnouncementItem[]>("/api/v1/hrms/engage/announcements?limit=50"),
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => {
      const payload: Record<string, unknown> = {
        title: body.title,
        content: body.content,
        isPinned: body.isPinned,
        visibility: body.visibility,
      };
      if (body.expiresAt) payload.expiresAt = new Date(body.expiresAt).toISOString();
      return api.post("/api/v1/hrms/engage/announcements", payload);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["announcements"] });
      qc.invalidateQueries({ queryKey: ["home", "announcements-sidebar"] });
      qc.invalidateQueries({ queryKey: ["home", "announcement-unread"] });
      qc.invalidateQueries({ queryKey: ["notifications"] });
      setShowCreate(false);
      resetForm();
    },
  });

  const announcements = data?.data ?? [];
  const now = Date.now();

  const stats = useMemo(() => {
    const pinned = announcements.filter((a) => a.isPinned).length;
    const active = announcements.filter((a) => a.publishedAt && (!a.expiresAt || new Date(a.expiresAt).getTime() > now)).length;
    const orgWide = announcements.filter((a) => a.visibility === "Organization").length;
    return { total: announcements.length, pinned, active, orgWide };
  }, [announcements, now]);

  const filtered = useMemo(() => {
    return announcements.filter((a) => {
      if (filter === "Pinned" && !a.isPinned) return false;
      if (filter === "Active" && !(a.publishedAt && (!a.expiresAt || new Date(a.expiresAt).getTime() > now))) return false;
      if (search) {
        const q = search.toLowerCase();
        return a.title.toLowerCase().includes(q) || a.content.toLowerCase().includes(q);
      }
      return true;
    });
  }, [announcements, filter, search, now]);

  return (
    <div>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F1F3D] via-[#14532d] to-[#16a34a] mb-4">
        <svg className="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 1200 200" preserveAspectRatio="none">
          <defs>
            <radialGradient id="ann-glow" cx="0.85" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#4ade80" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#14532d" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="1000" cy="100" rx="280" ry="180" fill="url(#ann-glow)" />
          <g stroke="#bbf7d0" strokeWidth="1" fill="none" opacity="0.4">
            <path d="M 500 80 Q 700 40 900 80 T 1300 80" />
            <path d="M 480 110 Q 700 70 920 110 T 1300 110" />
            <path d="M 460 140 Q 700 100 940 140 T 1300 140" />
          </g>
        </svg>
        <div className="relative px-6 py-7 flex items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm ring-1 ring-white/20 text-[11px] font-bold tracking-widest text-white/90 uppercase">
              <Megaphone size={12} /> Announcements
            </div>
            <h1 className="font-serif-display text-white text-base font-semibold mt-3">
              Keep everyone in the loop
            </h1>
            <p className="text-white/75 text-xs mt-1">Broadcast news, pin priorities, target the right audience.</p>
          </div>
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-white text-[#0F1F3D] text-xs font-medium shadow-lg hover:shadow-xl transition-shadow shrink-0"
          >
            <Plus size={13} /> <span className="hidden sm:inline">New announcement</span><span className="sm:hidden">New</span>
          </button>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatCard iconBg="bg-green-50" iconColor="text-green-600" Icon={Megaphone} label="Total" value={stats.total} caption="All announcements" />
        <StatCard iconBg="bg-amber-50" iconColor="text-amber-600" Icon={Pin} label="Pinned" value={stats.pinned} caption="Stay on top" />
        <StatCard iconBg="bg-emerald-50" iconColor="text-emerald-600" Icon={Sparkles} label="Active" value={stats.active} caption="Currently live" />
        <StatCard iconBg="bg-violet-50" iconColor="text-violet-600" Icon={Globe2} label="Org-wide" value={stats.orgWide} caption="Visible to all" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          {/* Filter bar */}
          <FilterBar>
            <FilterPills
              value={filter}
              onChange={(v) => setFilter(v as "All" | "Pinned" | "Active")}
              options={[
                { value: "All", label: "All" },
                { value: "Pinned", label: "Pinned" },
                { value: "Active", label: "Active" },
              ]}
            />
            <FilterDivider />
            <FilterSearch value={search} onChange={setSearch} placeholder="Search announcements..." />
          </FilterBar>

          {/* Feed */}
          {isLoading ? <SkeletonCards count={4} /> : filtered.length === 0 ? (
            <div className="surface-card p-12 text-center">
              <div className="w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center mx-auto mb-3">
                <Megaphone size={24} className="text-green-600" />
              </div>
              <p className="font-serif-display text-[13px] font-semibold text-gray-900">No announcements yet</p>
              <p className="text-xs text-gray-500 mt-1">{search || filter !== "All" ? "Try a different filter." : "Publish the first one to get started."}</p>
            </div>
          ) : (
            <div className="space-y-4">
              {filtered.map((a, idx) => {
                const vs = visibilityStyles[a.visibility] ?? visibilityStyles.Organization;
                return (
                  <article
                    key={a.id}
                    className={`row-stagger card-hover-lift surface-card p-4 ${a.isPinned ? "ring-1 ring-amber-200 bg-gradient-to-br from-amber-50/40 to-white" : ""}`}
                    style={{ ["--i" as never]: Math.min(idx, 10) }}
                  >
                    {a.isPinned && (
                      <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider mb-3">
                        <Pin size={10} /> Pinned
                      </div>
                    )}
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-gradient-to-br from-[#14532d] to-[#16a34a] flex items-center justify-center text-white font-bold text-sm shrink-0">
                        {a.author.profilePhoto ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={a.author.profilePhoto} alt="" className="w-full h-full rounded-full object-cover" />
                        ) : (
                          <span>{a.author.firstName?.[0]}{a.author.lastName?.[0]}</span>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[13px] font-semibold text-gray-900">{a.author.firstName} {a.author.lastName}</span>
                          <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1 ${vs.bg} ${vs.text} ${vs.ring}`}>
                            <Globe2 size={9} /> {a.visibility}
                          </span>
                          {a.publishedAt && (
                            <span className="inline-flex items-center gap-1 text-[11px] text-gray-500">
                              <Calendar size={10} />
                              {new Date(a.publishedAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}
                            </span>
                          )}
                        </div>
                        <h2 className="font-serif-display text-[13px] font-semibold text-gray-900 mt-1.5 leading-snug">{a.title}</h2>
                        <p className="text-xs text-gray-700 mt-2 whitespace-pre-wrap leading-relaxed">{a.content}</p>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="surface-card p-4">
            <h3 className="text-[13px] font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <Sparkles size={14} className="text-green-600" /> At a glance
            </h3>
            <ul className="space-y-3">
              <StatRow label="Total announcements" value={stats.total} />
              <StatRow label="Pinned" value={stats.pinned} />
              <StatRow label="Active now" value={stats.active} />
              <StatRow label="Org-wide" value={stats.orgWide} />
            </ul>
          </div>

          <div className="surface-card p-4">
            <h3 className="text-[13px] font-semibold text-gray-900 mb-2">Posting tips</h3>
            <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside">
              <li>Pin urgent updates so they stay on top.</li>
              <li>Target departments or teams for relevance.</li>
              <li>Set an expiry to auto-archive stale notices.</li>
              <li>Keep titles short and content scannable.</li>
            </ul>
          </div>
        </aside>
      </div>

      <Modal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        title="New Announcement"
        subtitle="Broadcast updates that reach the right people."
        headerIcon={<Megaphone size={18} />}
        size="lg"
        bodyClassName="p-0 overflow-y-auto"
      >
        <form onSubmit={(e) => { e.preventDefault(); createMut.mutate(form); }}>
          {/* Live preview header */}
          <div className="px-5 pt-5 pb-4 bg-gradient-to-br from-green-50/60 via-white to-violet-50/40 border-b border-gray-100">
            <p className="text-[10px] font-bold uppercase tracking-widest text-gray-500 mb-2">Preview</p>
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#14532d] to-[#16a34a] flex items-center justify-center text-white shrink-0 shadow-md">
                <Megaphone size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {form.isPinned && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-bold uppercase tracking-wider">
                      <Pin size={9} /> Pinned
                    </span>
                  )}
                  <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ring-1 ${(visibilityStyles[form.visibility] ?? visibilityStyles.Organization).bg} ${(visibilityStyles[form.visibility] ?? visibilityStyles.Organization).text} ${(visibilityStyles[form.visibility] ?? visibilityStyles.Organization).ring}`}>
                    <Globe2 size={9} /> {form.visibility}
                  </span>
                </div>
                <p className="font-serif-display text-[13px] font-semibold text-gray-900 mt-1.5 leading-snug truncate">
                  {form.title || "Your announcement title appears here"}
                </p>
                <p className="text-xs text-gray-500 mt-0.5 line-clamp-1">
                  {form.content || "Body preview will show as you type..."}
                </p>
              </div>
            </div>
          </div>

          {/* Form body */}
          <div className="p-4 space-y-4">
            {/* Title */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold text-gray-800">Title</label>
                <span className={`text-[11px] font-medium ${form.title.length > 100 ? "text-rose-500" : "text-gray-400"}`}>
                  {form.title.length}/120
                </span>
              </div>
              <input
                type="text"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value.slice(0, 120) })}
                required
                placeholder="e.g. Q2 All-hands on Friday"
                className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-colors"
              />
            </div>

            {/* Content */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-sm font-semibold text-gray-800">Message</label>
                <span className="text-[11px] font-medium text-gray-400">{form.content.length} chars</span>
              </div>
              <textarea
                value={form.content}
                onChange={(e) => setForm({ ...form, content: e.target.value })}
                required
                rows={5}
                placeholder="What do you want everyone to know? Add details, links, next steps..."
                className="w-full border border-[var(--border)] rounded-lg px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500 transition-colors resize-none"
              />
            </div>

            {/* Visibility chips */}
            <div>
              <label className="block text-sm font-semibold text-gray-800 mb-2">Audience</label>
              <div className="grid grid-cols-3 gap-2">
                {([
                  { v: "Organization", Icon: Globe2, hint: "Everyone" },
                  { v: "Department", Icon: Building2, hint: "By dept" },
                  { v: "Team", Icon: Users, hint: "Direct team" },
                ] as const).map(({ v, Icon, hint }) => {
                  const active = form.visibility === v;
                  return (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setForm({ ...form, visibility: v })}
                      className={`relative flex flex-col items-start gap-1 p-3 rounded-xl border-2 text-left transition-all ${
                        active
                          ? "border-green-500 bg-green-50/70 shadow-sm"
                          : "border-gray-200 hover:border-gray-300 hover:bg-gray-50"
                      }`}
                    >
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${active ? "bg-green-500 text-white" : "bg-gray-100 text-gray-500"}`}>
                        <Icon size={14} />
                      </div>
                      <span className={`text-[13px] font-semibold ${active ? "text-green-900" : "text-gray-800"}`}>{v}</span>
                      <span className="text-[11px] text-gray-500">{hint}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Options row */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Pin toggle */}
              <button
                type="button"
                onClick={() => setForm({ ...form, isPinned: !form.isPinned })}
                className={`flex items-center justify-between gap-3 p-3.5 rounded-xl border-2 transition-all ${
                  form.isPinned ? "border-amber-400 bg-amber-50/60" : "border-gray-200 hover:border-gray-300"
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className={`w-9 h-9 rounded-lg flex items-center justify-center shrink-0 ${form.isPinned ? "bg-amber-400 text-white" : "bg-gray-100 text-gray-500"}`}>
                    <Pin size={14} />
                  </div>
                  <div className="text-left min-w-0">
                    <p className="text-[13px] font-semibold text-gray-800">Pin to top</p>
                    <p className="text-[11px] text-gray-500 truncate">Keep highly visible</p>
                  </div>
                </div>
                <span className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors shrink-0 ${form.isPinned ? "bg-amber-500" : "bg-gray-300"}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${form.isPinned ? "translate-x-4" : "translate-x-0.5"}`} />
                </span>
              </button>

              {/* Expiry */}
              <div className="flex items-center gap-3 p-3.5 rounded-xl border-2 border-gray-200 focus-within:border-green-500 transition-colors">
                <div className="w-9 h-9 rounded-lg bg-gray-100 text-gray-500 flex items-center justify-center shrink-0">
                  <CalendarClock size={14} />
                </div>
                <div className="flex-1 min-w-0">
                  <label className="block text-sm font-semibold text-gray-800">Expires</label>
                  <input
                    type="date"
                    value={form.expiresAt}
                    min={todayInput()}
                    onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
                    className="w-full text-[11px] text-gray-500 bg-transparent border-0 p-0 focus:outline-none focus:ring-0"
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between gap-3 px-5 py-4 bg-gray-50/70 border-t border-gray-100">
            <p className="text-[11px] text-gray-500 hidden sm:block">
              {form.isPinned ? "Pinned " : ""}
              {form.visibility === "Organization" ? "to everyone in your org" : `to ${form.visibility.toLowerCase()}`}
              {form.expiresAt ? ` · expires ${new Date(form.expiresAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short" })}` : ""}
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
                disabled={createMut.isPending || !form.title.trim() || !form.content.trim()}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-[#14532d] to-[#16a34a] text-white rounded-lg text-xs font-medium shadow-md hover:shadow-lg disabled:opacity-50 disabled:cursor-not-allowed transition-all"
              >
                <Send size={13} />
                {createMut.isPending ? "Publishing..." : "Publish"}
              </button>
            </div>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function StatCard({
  iconBg, iconColor, Icon, label, value, caption,
}: {
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
  label: string;
  value: number;
  caption: string;
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

function StatRow({ label, value }: { label: string; value: number }) {
  return (
    <li className="flex items-center justify-between gap-2 text-xs">
      <span className="text-gray-600">{label}</span>
      <span className="font-bold text-gray-900">{value}</span>
    </li>
  );
}
