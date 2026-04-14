"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Users, Star, AlertTriangle, TrendingUp, ChevronDown,
  X, Plus, Save, LayoutGrid, List,
} from "lucide-react";
import { useTalent, useUpsertTalent } from "@/lib/hooks/usePerformance";

// ─── Types ──────────────────────────────────────────────────────────────────

type PotentialBand = "low" | "medium" | "high";
type PerfBand      = "low" | "medium" | "high";
type FlightRisk    = "low" | "medium" | "high";
type Succession    = "not-ready" | "developing" | "ready-now";

interface Person {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  teamName: string | null;
  performanceScore: number | null;
  perfBand: PerfBand;
  kpiCount: number;
  priorityCount: number;
  potential: PotentialBand | null;
  flightRisk: FlightRisk | null;
  successionReady: Succession | null;
  skills: string[];
  developmentNotes: string | null;
  assessmentId: string | null;
  assessorName: string | null;
  lastAssessed: string | null;
  quarter: string | null;
  year: number | null;
}

// ─── 9-box config ────────────────────────────────────────────────────────────

const BOX_LABELS: Record<string, { label: string; sub: string; bg: string; border: string; text: string }> = {
  "high-high":   { label: "Star",             sub: "High performer, high potential", bg: "bg-purple-50",  border: "border-purple-300", text: "text-purple-800" },
  "high-medium": { label: "High Performer",   sub: "Delivers results, moderate potential", bg: "bg-green-50",   border: "border-green-300",  text: "text-green-800"  },
  "high-low":    { label: "Specialist",       sub: "Expert in role, limited growth", bg: "bg-teal-50",    border: "border-teal-300",   text: "text-teal-800"   },
  "medium-high": { label: "High Potential",   sub: "Growth ahead, building performance", bg: "bg-accent-50",    border: "border-accent-300",   text: "text-accent-800"   },
  "medium-medium":{ label: "Core Player",     sub: "Solid contributor, steady growth", bg: "bg-sky-50",     border: "border-sky-300",    text: "text-sky-800"    },
  "medium-low":  { label: "Average Player",   sub: "Meets expectations, limited upside", bg: "bg-gray-50",    border: "border-gray-300",   text: "text-gray-600"   },
  "low-high":    { label: "Enigma",           sub: "High potential, underperforming", bg: "bg-amber-50",   border: "border-amber-300",  text: "text-amber-800"  },
  "low-medium":  { label: "Inconsistent",     sub: "Variable performance, some potential", bg: "bg-orange-50",  border: "border-orange-300", text: "text-orange-800" },
  "low-low":     { label: "Underperformer",   sub: "Needs significant improvement", bg: "bg-red-50",     border: "border-red-300",    text: "text-red-800"    },
};

const POTENTIAL_LABELS: Record<PotentialBand, string> = { high: "High", medium: "Medium", low: "Low" };
const FLIGHT_LABELS:    Record<FlightRisk,    string> = { low: "Low", medium: "Medium", high: "High" };
const SUCCESSION_LABELS: Record<Succession,   string> = { "not-ready": "Not Ready", developing: "Developing", "ready-now": "Ready Now" };

function boxKey(perf: PerfBand, potential: PotentialBand) { return `${perf}-${potential}`; }

function initials(p: Person) {
  return `${p.firstName[0]}${p.lastName[0]}`.toUpperCase();
}

function avatarColor(name: string) {
  const colors = ["bg-blue-500","bg-purple-500","bg-green-500","bg-amber-500","bg-rose-500","bg-teal-500","bg-indigo-500","bg-orange-500"];
  let h = 0;
  for (let i = 0; i < name.length; i++) h = name.charCodeAt(i) + ((h << 5) - h);
  return colors[Math.abs(h) % colors.length];
}

function flightBadge(risk: FlightRisk | null) {
  if (!risk) return null;
  const styles = { low: "bg-green-100 text-green-700", medium: "bg-amber-100 text-amber-700", high: "bg-red-100 text-red-700" };
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${styles[risk]}`}>{FLIGHT_LABELS[risk]}</span>;
}

function successionBadge(s: Succession | null) {
  if (!s) return null;
  const styles = { "not-ready": "bg-gray-100 text-gray-600", developing: "bg-accent-100 text-accent-700", "ready-now": "bg-green-100 text-green-700" };
  return <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${styles[s]}`}>{SUCCESSION_LABELS[s]}</span>;
}

// ─── Assessment Drawer ───────────────────────────────────────────────────────

function AssessmentDrawer({
  person, onClose, onSaved, currentQuarter, currentYear,
}: {
  person: Person; onClose: () => void; onSaved: (updated: Partial<Person>) => void;
  currentQuarter: string; currentYear: number;
}) {
  const [potential,    setPotential]    = useState<PotentialBand>(person.potential || "medium");
  const [flightRisk,   setFlightRisk]   = useState<FlightRisk>(person.flightRisk || "low");
  const [succession,   setSuccession]   = useState<Succession>(person.successionReady || "not-ready");
  const [notes,        setNotes]        = useState(person.developmentNotes || "");
  const [skillInput,   setSkillInput]   = useState("");
  const [skills,       setSkills]       = useState<string[]>(person.skills || []);
  const upsertTalent = useUpsertTalent();
  const saving = upsertTalent.isPending;

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) { setSkills([...skills, s]); setSkillInput(""); }
  };

  const save = async () => {
    const json = await upsertTalent.mutateAsync({
      userId: person.userId, potential, flightRisk,
      successionReady: succession, skills, developmentNotes: notes,
      quarter: currentQuarter, year: currentYear,
    });
    if (json?.success) {
      onSaved({ potential, flightRisk, successionReady: succession, skills, developmentNotes: notes });
      onClose();
    }
  };

  const box = BOX_LABELS[boxKey(person.perfBand, potential)];

  const OptionBtn = ({ value, current, label, onChange, colors }: any) => (
    <button
      onClick={() => onChange(value)}
      className={`flex-1 py-1.5 text-xs font-medium rounded border transition-all ${
        current === value ? `${colors.active} border-transparent` : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
      }`}
    >{label}</button>
  );

  return (
    <div className="fixed inset-0 z-[200] flex">
      <div className="flex-1 bg-black/30" onClick={onClose} />
      <div className="w-[420px] bg-white shadow-2xl flex flex-col h-full overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-full ${avatarColor(person.firstName)} flex items-center justify-center text-white text-xs font-bold`}>
              {initials(person)}
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">{person.firstName} {person.lastName}</p>
              <p className="text-xs text-gray-400">{person.teamName || person.role}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 hover:bg-gray-100 rounded"><X className="w-4 h-4 text-gray-400" /></button>
        </div>

        {/* 9-box preview */}
        <div className={`mx-5 mt-4 p-3 rounded-lg border ${box.bg} ${box.border}`}>
          <p className={`text-xs font-bold ${box.text}`}>{box.label}</p>
          <p className={`text-xs mt-0.5 ${box.text} opacity-80`}>{box.sub}</p>
          <p className="text-xs text-gray-500 mt-1">Performance: <span className="font-medium capitalize">{person.perfBand}</span>{person.performanceScore !== null ? ` (${person.performanceScore}%)` : ""}</p>
        </div>

        <div className="flex-1 px-5 py-4 space-y-5">
          {/* Potential */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Potential</label>
            <div className="flex gap-2">
              {(["low","medium","high"] as PotentialBand[]).map(v => (
                <OptionBtn key={v} value={v} current={potential} label={POTENTIAL_LABELS[v]} onChange={setPotential}
                  colors={{ active: v === "high" ? "bg-purple-100 text-purple-700" : v === "medium" ? "bg-accent-100 text-accent-700" : "bg-gray-200 text-gray-700" }} />
              ))}
            </div>
          </div>

          {/* Flight Risk */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Flight Risk</label>
            <div className="flex gap-2">
              {(["low","medium","high"] as FlightRisk[]).map(v => (
                <OptionBtn key={v} value={v} current={flightRisk} label={FLIGHT_LABELS[v]} onChange={setFlightRisk}
                  colors={{ active: v === "high" ? "bg-red-100 text-red-700" : v === "medium" ? "bg-amber-100 text-amber-700" : "bg-green-100 text-green-700" }} />
              ))}
            </div>
          </div>

          {/* Succession */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Succession Readiness</label>
            <div className="flex gap-2">
              {(["not-ready","developing","ready-now"] as Succession[]).map(v => (
                <OptionBtn key={v} value={v} current={succession} label={SUCCESSION_LABELS[v]} onChange={setSuccession}
                  colors={{ active: v === "ready-now" ? "bg-green-100 text-green-700" : v === "developing" ? "bg-accent-100 text-accent-700" : "bg-gray-200 text-gray-600" }} />
              ))}
            </div>
          </div>

          {/* Skills */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Skills & Competencies</label>
            <div className="flex gap-2 mb-2">
              <input
                value={skillInput}
                onChange={e => setSkillInput(e.target.value)}
                onKeyDown={e => e.key === "Enter" && addSkill()}
                placeholder="Add skill…"
                className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent-400"
              />
              <button onClick={addSkill} className="p-1.5 bg-accent-50 hover:bg-accent-100 rounded border border-accent-200">
                <Plus className="w-3.5 h-3.5 text-accent-600" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {skills.map(s => (
                <span key={s} className="flex items-center gap-1 bg-accent-50 text-accent-700 border border-accent-200 text-xs px-2 py-0.5 rounded-full">
                  {s}
                  <button onClick={() => setSkills(skills.filter(x => x !== s))}><X className="w-2.5 h-2.5" /></button>
                </span>
              ))}
              {skills.length === 0 && <p className="text-xs text-gray-400">No skills added yet</p>}
            </div>
          </div>

          {/* Development Notes */}
          <div>
            <label className="block text-xs font-semibold text-gray-700 mb-2">Development Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={4}
              placeholder="Growth areas, development plan, coaching notes…"
              className="w-full border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-accent-400 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-4 border-t border-gray-100 flex items-center justify-between">
          <p className="text-xs text-gray-400">
            {person.lastAssessed ? `Last saved: ${new Date(person.lastAssessed).toLocaleDateString()}` : "No assessment yet"}
          </p>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 bg-accent-600 hover:bg-accent-700 text-white text-xs font-medium px-4 py-2 rounded disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Save Assessment"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TalentAssessmentPage() {
  const { data, isLoading: loading } = useTalent();
  const people = (data as Person[]) ?? [];
  const [view,         setView]         = useState<"grid" | "list">("grid");
  const [selected,     setSelected]     = useState<Person | null>(null);
  const [quarterFilter, setQuarterFilter] = useState("Q1");
  const [yearFilter,   setYearFilter]   = useState(new Date().getFullYear());

  // Invalidation is handled by useUpsertTalent onSuccess — no local state updates needed
  const handleSaved = (_updated: Partial<Person>) => {};

  // Build 9-box data: group people by (perfBand, potential)
  const gridData: Record<string, Person[]> = {};
  const perfs: PerfBand[] = ["low","medium","high"];
  const potentials: PotentialBand[] = ["low","medium","high"];
  perfs.forEach(perf => potentials.forEach(pot => { gridData[boxKey(perf, pot)] = []; }));
  people.forEach(p => {
    const pot = p.potential || "medium";
    const key = boxKey(p.perfBand, pot as PotentialBand);
    if (gridData[key]) gridData[key].push(p);
  });

  const assessed   = people.filter(p => p.potential !== null).length;
  const stars      = (gridData["high-high"] || []).length;
  const highFlight = people.filter(p => p.flightRisk === "high").length;
  const readyNow   = people.filter(p => p.successionReady === "ready-now").length;

  if (loading) return (
    <div className="p-6 space-y-4">
      {[1,2,3].map(i => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-sm font-bold text-gray-900">Talent Assessment</h1>
          <p className="text-xs text-gray-400 mt-0.5">9-box grid — performance vs potential</p>
        </div>
        <div className="flex items-center gap-3">
          {/* Quarter / Year */}
          <select value={quarterFilter} onChange={e => setQuarterFilter(e.target.value)}
            className="border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none">
            {["Q1","Q2","Q3","Q4"].map(q => <option key={q}>{q}</option>)}
          </select>
          <select value={yearFilter} onChange={e => setYearFilter(Number(e.target.value))}
            className="border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none">
            {[yearFilter-1, yearFilter, yearFilter+1].map(y => <option key={y}>{y}</option>)}
          </select>
          {/* View toggle */}
          <div className="flex border border-gray-200 rounded overflow-hidden">
            <button onClick={() => setView("grid")} className={`p-1.5 ${view==="grid" ? "bg-accent-600 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}>
              <LayoutGrid className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setView("list")} className={`p-1.5 ${view==="list" ? "bg-accent-600 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}>
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="px-6 py-3 grid grid-cols-4 gap-3 flex-shrink-0">
        {[
          { label: "Total People", value: people.length, icon: Users, color: "text-accent-600 bg-accent-50" },
          { label: "Assessed", value: `${assessed}/${people.length}`, icon: Star, color: "text-purple-600 bg-purple-50" },
          { label: "Stars ⭐", value: stars, icon: TrendingUp, color: "text-green-600 bg-green-50" },
          { label: "High Flight Risk", value: highFlight, icon: AlertTriangle, color: "text-red-600 bg-red-50" },
        ].map(({ label, value, icon: Icon, color }) => (
          <div key={label} className="bg-white border border-gray-100 rounded-lg px-4 py-3 flex items-center gap-3">
            <div className={`p-2 rounded-lg ${color.split(" ")[1]}`}>
              <Icon className={`w-4 h-4 ${color.split(" ")[0]}`} />
            </div>
            <div>
              <p className="text-lg font-bold text-gray-900">{value}</p>
              <p className="text-xs text-gray-400">{label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6">
        {view === "grid" ? (
          <NineBoxGrid gridData={gridData} onSelect={setSelected} />
        ) : (
          <ListView people={people} onSelect={setSelected} />
        )}
      </div>

      {/* Drawer */}
      {selected && (
        <AssessmentDrawer
          person={selected}
          onClose={() => setSelected(null)}
          onSaved={handleSaved}
          currentQuarter={quarterFilter}
          currentYear={yearFilter}
        />
      )}
    </div>
  );
}

// ─── 9-Box Grid ──────────────────────────────────────────────────────────────

function NineBoxGrid({ gridData, onSelect }: { gridData: Record<string, Person[]>; onSelect: (p: Person) => void }) {
  const perfs:      PerfBand[]     = ["high","medium","low"];   // top to bottom
  const potentials: PotentialBand[] = ["low","medium","high"];  // left to right

  return (
    <div className="mt-2">
      {/* Y-axis label */}
      <div className="flex items-start gap-2">
        {/* Y label */}
        <div className="flex flex-col items-center justify-center" style={{ width: 24, minHeight: 480 }}>
          <span className="text-xs text-gray-400 font-medium" style={{ writingMode: "vertical-rl", transform: "rotate(180deg)" }}>
            ← Performance
          </span>
        </div>
        {/* Grid */}
        <div className="flex-1">
          {/* X-axis top labels */}
          <div className="grid grid-cols-3 gap-1 mb-1 ml-0" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
            {potentials.map(pot => (
              <div key={pot} className="text-center text-xs text-gray-400 font-medium py-0.5 capitalize">{pot} Potential</div>
            ))}
          </div>
          {/* Rows */}
          {perfs.map(perf => (
            <div key={perf} className="grid gap-1 mb-1" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
              {potentials.map(pot => {
                const key = boxKey(perf, pot);
                const cfg = BOX_LABELS[key];
                const cell = gridData[key] || [];
                return (
                  <div key={key} className={`${cfg.bg} border ${cfg.border} rounded-lg p-3 min-h-[130px]`}>
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <p className={`text-xs font-bold ${cfg.text}`}>{cfg.label}</p>
                        <p className={`text-xs ${cfg.text} opacity-70 leading-tight mt-0.5`}>{cfg.sub}</p>
                      </div>
                      {cell.length > 0 && (
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded-full ${cfg.bg} border ${cfg.border} ${cfg.text}`}>
                          {cell.length}
                        </span>
                      )}
                    </div>
                    <div className="flex flex-wrap gap-1.5 mt-2">
                      {cell.map(p => (
                        <button
                          key={p.userId}
                          onClick={() => onSelect(p)}
                          title={`${p.firstName} ${p.lastName} — ${p.performanceScore ?? "—"}%`}
                          className={`w-7 h-7 rounded-full ${avatarColor(p.firstName)} text-white text-xs font-bold hover:ring-2 hover:ring-offset-1 hover:ring-accent-400 transition-all flex items-center justify-center`}
                        >
                          {initials(p)}
                        </button>
                      ))}
                      {cell.length === 0 && (
                        <p className="text-xs text-gray-300 italic">No one here</p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
          {/* X-axis bottom label */}
          <div className="text-center text-xs text-gray-400 font-medium mt-1">Potential →</div>
        </div>
      </div>

      {/* Legend */}
      <div className="mt-4 flex flex-wrap gap-2">
        {Object.entries(BOX_LABELS).map(([key, cfg]) => (
          <div key={key} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border ${cfg.bg} ${cfg.border}`}>
            <span className={`text-xs font-medium ${cfg.text}`}>{cfg.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── List View ───────────────────────────────────────────────────────────────

function ListView({ people, onSelect }: { people: Person[]; onSelect: (p: Person) => void }) {
  const [search, setSearch] = useState("");
  const filtered = people.filter(p =>
    `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mt-2">
      <div className="mb-3">
        <input
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search people…"
          className="border border-gray-200 rounded px-3 py-1.5 text-xs w-64 focus:outline-none focus:border-accent-400"
        />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="border-separate border-spacing-0 text-xs w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              {["#","Name","Team","Performance","Potential","Box","Flight Risk","Succession","Skills","Action"].map(h => (
                <th key={h} className="bg-accent-50 border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap last:border-r-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="text-center py-10 text-xs text-gray-400">No people found</td></tr>
            )}
            {filtered.map((p, i) => {
              const pot = p.potential || "medium";
              const box = BOX_LABELS[boxKey(p.perfBand, pot as PotentialBand)];
              return (
                <tr key={p.userId} className="hover:bg-accent-50/30 transition-colors group">
                  <td className="px-3 py-2 border-b border-r border-gray-100 text-gray-400">{i+1}</td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full ${avatarColor(p.firstName)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                        {initials(p)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{p.firstName} {p.lastName}</p>
                        <p className="text-gray-400">{p.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 border-b border-r border-gray-100 text-gray-600">{p.teamName || "—"}</td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                      p.perfBand === "high" ? "bg-green-100 text-green-700" :
                      p.perfBand === "medium" ? "bg-accent-100 text-accent-700" : "bg-red-100 text-red-700"
                    }`}>
                      {p.performanceScore !== null ? `${p.performanceScore}%` : "—"} ({p.perfBand})
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    {p.potential ? (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${
                        p.potential === "high" ? "bg-purple-100 text-purple-700" :
                        p.potential === "medium" ? "bg-accent-100 text-accent-700" : "bg-gray-100 text-gray-600"
                      }`}>{POTENTIAL_LABELS[p.potential]}</span>
                    ) : <span className="text-gray-300">Not set</span>}
                  </td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${box.bg} ${box.border} ${box.text}`}>
                      {box.label}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">{flightBadge(p.flightRisk)}</td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">{successionBadge(p.successionReady)}</td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    <div className="flex flex-wrap gap-1">
                      {p.skills.slice(0,3).map(s => (
                        <span key={s} className="bg-accent-50 text-accent-600 border border-accent-100 text-xs px-1.5 py-0.5 rounded-full">{s}</span>
                      ))}
                      {p.skills.length > 3 && <span className="text-gray-400 text-xs">+{p.skills.length-3}</span>}
                      {p.skills.length === 0 && <span className="text-gray-300">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100">
                    <button
                      onClick={() => onSelect(p)}
                      className="px-2.5 py-1 bg-accent-50 hover:bg-accent-100 text-accent-600 text-xs font-medium rounded border border-accent-200 transition-colors"
                    >
                      Assess
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
