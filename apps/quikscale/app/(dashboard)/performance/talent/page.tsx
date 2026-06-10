"use client";

import { useState } from "react";
import {
  Users,
  Star,
  AlertTriangle,
  TrendingUp,
  X,
  Plus,
  Save,
  List,
  Sparkles,
  CheckCircle2,
  Circle,
  HelpCircle,
  LayoutDashboard,
  SlidersHorizontal,
} from "lucide-react";
import { useTalent, useUpsertTalent, useTalentBenchmark, useUpdateTalentBenchmark } from "@/lib/hooks/usePerformance";
import { RightPanel, RightPanelFooter } from "@quikit/ui";
import type {
  RehireDecision, RightSeat, Capacity, Quadrant,
} from "@/lib/schemas/talentSchema";
import DashboardView from "./DashboardView";

// ─── Types ──────────────────────────────────────────────────────────────────

type PotentialBand = "low" | "medium" | "high";
type PerfBand = "low" | "medium" | "high";
type FlightRisk = "low" | "medium" | "high";
type Succession = "not-ready" | "developing" | "ready-now";
type Classification = "A" | "B" | "C" | null;

interface Person {
  userId: string;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  teamName: string | null;

  // Auto-derived (Scaling-Up Block A)
  performanceScore: number | null;
  perfBand: PerfBand;
  kpiCount: number;
  kpiScore: number | null;
  priorityCount: number;
  priorityScore: number | null;
  huddleAttendancePct: number | null;
  seatsOwned: number;
  seatNames: string[];
  lastReviewScore: number | null;
  lastReviewPeriod: string | null;
  tenureDays: number | null;

  // Manager judgment (Scaling-Up Block B)
  rehireDecision: RehireDecision;
  rightSeat: RightSeat;
  coreValuesScore: number | null;
  capacity: Capacity | null;
  doMore: string | null;
  doLess: string | null;

  classification: Classification;
  potentialScore: number | null;
  quadrant: Quadrant | null;

  // Legacy 9-box (preserved)
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

const BOX_LABELS: Record<
  string,
  { label: string; sub: string; bg: string; border: string; text: string }
> = {
  "high-high":   { label: "Star",            sub: "High performer, high potential",            bg: "bg-purple-50", border: "border-purple-300", text: "text-purple-800" },
  "high-medium": { label: "High Performer",  sub: "Delivers results, moderate potential",      bg: "bg-green-50",  border: "border-green-300",  text: "text-green-800" },
  "high-low":    { label: "Specialist",      sub: "Expert in role, limited growth",            bg: "bg-teal-50",   border: "border-teal-300",   text: "text-teal-800" },
  "medium-high": { label: "High Potential",  sub: "Growth ahead, building performance",        bg: "bg-accent-50", border: "border-accent-300", text: "text-accent-800" },
  "medium-medium": { label: "Core Player",   sub: "Solid contributor, steady growth",          bg: "bg-sky-50",    border: "border-sky-300",    text: "text-sky-800" },
  "medium-low":  { label: "Average Player",  sub: "Meets expectations, limited upside",        bg: "bg-gray-50",   border: "border-gray-300",   text: "text-gray-600" },
  "low-high":    { label: "Enigma",          sub: "High potential, underperforming",           bg: "bg-amber-50",  border: "border-amber-300",  text: "text-amber-800" },
  "low-medium":  { label: "Inconsistent",    sub: "Variable performance, some potential",      bg: "bg-orange-50", border: "border-orange-300", text: "text-orange-800" },
  "low-low":     { label: "Underperformer",  sub: "Needs significant improvement",             bg: "bg-red-50",    border: "border-red-300",    text: "text-red-800" },
};

const POTENTIAL_LABELS: Record<PotentialBand, string> = { high: "High", medium: "Medium", low: "Low" };
const FLIGHT_LABELS: Record<FlightRisk, string> = { low: "Low", medium: "Medium", high: "High" };
const SUCCESSION_LABELS: Record<Succession, string> = { "not-ready": "Not Ready", developing: "Developing", "ready-now": "Ready Now" };

// ─── Scaling-Up display helpers ──────────────────────────────────────────────

const CLASSIFICATION_STYLE: Record<"A" | "B" | "C", { label: string; bg: string; text: string; border: string }> = {
  A: { label: "A Player",  bg: "bg-green-50",  text: "text-green-700",  border: "border-green-300" },
  B: { label: "B Player",  bg: "bg-amber-50",  text: "text-amber-800",  border: "border-amber-300" },
  C: { label: "C Player",  bg: "bg-red-50",    text: "text-red-700",    border: "border-red-300" },
};

const REHIRE_STYLE: Record<RehireDecision, { label: string; bg: string; text: string }> = {
  enthusiastic: { label: "Enthusiastic",   bg: "bg-green-100",  text: "text-green-700" },
  probably:     { label: "Probably",       bg: "bg-amber-100",  text: "text-amber-800" },
  no:           { label: "Would not",      bg: "bg-red-100",    text: "text-red-700" },
  unrated:      { label: "Not yet rated",  bg: "bg-gray-100",   text: "text-gray-500" },
};

function boxKey(perf: PerfBand, potential: PotentialBand) {
  return `${perf}-${potential}`;
}

function initials(p: Person) {
  return `${p.firstName[0]}${p.lastName[0]}`.toUpperCase();
}

function avatarColor(name: string) {
  const colors = ["bg-blue-500", "bg-purple-500", "bg-green-500", "bg-amber-500", "bg-rose-500", "bg-teal-500", "bg-indigo-500", "bg-orange-500"];
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

function classificationBadge(c: Classification, size: "sm" | "md" = "sm") {
  if (!c) {
    const pad = size === "md" ? "px-2.5 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]";
    return <span className={`${pad} rounded-full font-semibold bg-gray-100 text-gray-400 border border-gray-200`}>Unrated</span>;
  }
  const s = CLASSIFICATION_STYLE[c];
  const pad = size === "md" ? "px-2.5 py-1 text-xs" : "px-1.5 py-0.5 text-[10px]";
  return <span className={`${pad} rounded-full font-bold border ${s.bg} ${s.text} ${s.border}`}>{s.label}</span>;
}

function metric(value: number | null, suffix = "%") {
  return value === null ? <span className="text-gray-300">—</span> : <span className="font-semibold">{value}{suffix}</span>;
}

// ─── Assessment Drawer (Scaling-Up + Legacy in one) ──────────────────────────

function AssessmentDrawer({
  person,
  onClose,
  currentQuarter,
  currentYear,
}: {
  person: Person;
  onClose: () => void;
  currentQuarter: string;
  currentYear: number;
}) {
  // Scaling-Up state
  const [rehire,         setRehire]         = useState<RehireDecision>(person.rehireDecision || "unrated");
  const [rightSeat,      setRightSeat]      = useState<RightSeat>(person.rightSeat || "unrated");
  const [coreValues,     setCoreValues]     = useState<number | null>(person.coreValuesScore);
  const [capacity,       setCapacity]       = useState<Capacity | null>(person.capacity);
  const [doMore,         setDoMore]         = useState(person.doMore ?? "");
  const [doLess,         setDoLess]         = useState(person.doLess ?? "");

  // Legacy 9-box state
  const [potential,      setPotential]      = useState<PotentialBand>(person.potential || "medium");
  const [flightRisk,     setFlightRisk]     = useState<FlightRisk>(person.flightRisk || "low");
  const [succession,     setSuccession]     = useState<Succession>(person.successionReady || "not-ready");
  const [notes,          setNotes]          = useState(person.developmentNotes || "");
  const [skillInput,     setSkillInput]     = useState("");
  const [skills,         setSkills]         = useState<string[]>(person.skills || []);

  const upsertTalent = useUpsertTalent();
  const saving = upsertTalent.isPending;

  const addSkill = () => {
    const s = skillInput.trim();
    if (s && !skills.includes(s)) {
      setSkills([...skills, s]);
      setSkillInput("");
    }
  };

  const save = async () => {
    await upsertTalent.mutateAsync({
      userId: person.userId,
      // Scaling-Up
      rehireDecision: rehire,
      rightSeat,
      coreValuesScore: coreValues,
      capacity,
      doMore: doMore || null,
      doLess: doLess || null,
      // Legacy
      potential,
      flightRisk,
      successionReady: succession,
      skills,
      developmentNotes: notes,
      quarter: currentQuarter,
      year: currentYear,
    });
    onClose();
  };

  // Live A/B/C preview based on current drawer state.
  const liveClassification: Classification = (() => {
    if (rehire === "no") return "C";
    if (coreValues !== null && coreValues < 3) return "C";
    if (rehire === "enthusiastic" && (coreValues ?? 0) >= 4 && (person.performanceScore ?? 0) >= 70) return "A";
    if (rehire === "enthusiastic" || rehire === "probably") return "B";
    return null;
  })();

  return (
    <RightPanel
      open
      onClose={onClose}
      size="md"
      title={`${person.firstName} ${person.lastName}`}
      subtitle={person.teamName || person.role}
      footer={
        <RightPanelFooter>
          <div className="flex items-center gap-2">
            {classificationBadge(liveClassification, "md")}
            <p className="text-xs text-gray-400">
              {person.lastAssessed ? `Last saved: ${new Date(person.lastAssessed).toLocaleDateString()}` : "No assessment yet"}
            </p>
          </div>
          <button
            onClick={save}
            disabled={saving}
            className="flex items-center gap-1.5 bg-accent-500 hover:bg-accent-600 text-white text-xs font-medium px-4 py-2 rounded-md disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            {saving ? "Saving…" : "Save Assessment"}
          </button>
        </RightPanelFooter>
      }
    >
      {/* ── A. Auto signals (read-only) ── */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-accent-500" />
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Auto Signals</h3>
        </div>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <SignalTile label="KPI Hit Rate"        value={person.kpiScore}            suffix="%" subtitle={`${person.kpiCount} KPIs`} />
          <SignalTile label="Priority Completion" value={person.priorityScore}       suffix="%" subtitle={`${person.priorityCount} priorities`} />
          <SignalTile label="Last Review"         value={person.lastReviewScore}     suffix="" subtitle={person.lastReviewPeriod ?? "—"} />
        </div>

        {/* Seats owned — FACe diagnostic */}
        <div className="px-3 py-2.5 rounded-lg border border-gray-200 bg-gray-50/50">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] font-semibold text-gray-700">Seats Owned (FACe)</span>
            <span className={`text-xs font-bold ${person.seatsOwned > 1 ? "text-amber-700" : "text-gray-700"}`}>
              {person.seatsOwned}
            </span>
          </div>
          {person.seatNames.length === 0 ? (
            <p className="text-[10px] text-gray-400">Not assigned to any accountability function</p>
          ) : (
            <div className="flex flex-wrap gap-1">
              {person.seatNames.map((n) => (
                <span key={n} className="text-[10px] px-1.5 py-0.5 rounded bg-white border border-gray-200 text-gray-600">{n}</span>
              ))}
            </div>
          )}
          {person.seatsOwned > 1 && (
            <p className="text-[10px] text-amber-700 mt-1.5">⚠ Person is in more than one seat — may be stretched.</p>
          )}
        </div>
      </section>

      {/* ── B. Scaling-Up manager judgment ── */}
      <section className="space-y-4 mt-6">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="w-3.5 h-3.5 text-accent-500" />
          <h3 className="text-xs font-bold text-gray-800 uppercase tracking-wider">Scaling Up Assessment</h3>
        </div>

        {/* Rehire decision — the keystone gate */}
        <Field
          label="Would you enthusiastically rehire this person today?"
          help="Borrowed from Topgrading. 'Enthusiastically' is the key word — anything less is a tell."
        >
          <div className="grid grid-cols-3 gap-2">
            {(["enthusiastic", "probably", "no"] as RehireDecision[]).map((v) => (
              <Pill
                key={v}
                selected={rehire === v}
                onClick={() => setRehire(v)}
                colors={
                  v === "enthusiastic" ? { active: "bg-green-100 text-green-700 border-green-300" }
                  : v === "probably"   ? { active: "bg-amber-100 text-amber-800 border-amber-300" }
                  :                      { active: "bg-red-100 text-red-700 border-red-300" }
                }
              >
                {REHIRE_STYLE[v].label}
              </Pill>
            ))}
          </div>
        </Field>

        {/* Right seat */}
        <Field label="Is the seat itself well-defined?">
          <div className="grid grid-cols-3 gap-2">
            {(["yes", "blurry", "wrong"] as RightSeat[]).map((v) => (
              <Pill
                key={v}
                selected={rightSeat === v}
                onClick={() => setRightSeat(v)}
                colors={{ active: v === "yes" ? "bg-green-100 text-green-700 border-green-300" : v === "blurry" ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-red-100 text-red-700 border-red-300" }}
              >
                {v === "yes" ? "Yes" : v === "blurry" ? "Blurry" : "Wrong role"}
              </Pill>
            ))}
          </div>
        </Field>

        {/* Core values 1–5 */}
        <Field label="Core Values Fit" help="Habit 7 — appraisal aligned with Core Values.">
          <div className="flex gap-1.5">
            {[1, 2, 3, 4, 5].map((n) => {
              const selected = coreValues === n;
              return (
                <button
                  key={n}
                  type="button"
                  onClick={() => setCoreValues(n)}
                  className={`flex-1 py-1.5 text-xs font-semibold rounded border transition-all ${
                    selected
                      ? n <= 2 ? "bg-red-100 border-red-300 text-red-700"
                        : n === 3 ? "bg-amber-100 border-amber-300 text-amber-800"
                        : "bg-green-100 border-green-300 text-green-700"
                      : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"
                  }`}
                >
                  {n}
                </button>
              );
            })}
            {coreValues !== null && (
              <button type="button" onClick={() => setCoreValues(null)} className="text-[10px] text-gray-400 hover:text-gray-600 px-1">
                clear
              </button>
            )}
          </div>
        </Field>

        {/* Capacity */}
        <Field label="Capacity">
          <div className="grid grid-cols-3 gap-2">
            {(["stretched", "right-sized", "underused"] as Capacity[]).map((v) => (
              <Pill
                key={v}
                selected={capacity === v}
                onClick={() => setCapacity(capacity === v ? null : v)}
                colors={{ active: v === "right-sized" ? "bg-green-100 text-green-700 border-green-300" : v === "stretched" ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-sky-100 text-sky-700 border-sky-300" }}
              >
                {v === "right-sized" ? "Right-sized" : v === "stretched" ? "Stretched" : "Underused"}
              </Pill>
            ))}
          </div>
        </Field>

        {/* Do more / Do less */}
        <div className="grid grid-cols-2 gap-3">
          <Field label="Do more (Start)">
            <textarea
              value={doMore}
              onChange={(e) => setDoMore(e.target.value)}
              rows={3}
              placeholder="One thing to start…"
              className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent-400 resize-none"
            />
          </Field>
          <Field label="Do less (Stop)">
            <textarea
              value={doLess}
              onChange={(e) => setDoLess(e.target.value)}
              rows={3}
              placeholder="One thing to stop…"
              className="w-full border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent-400 resize-none"
            />
          </Field>
        </div>
      </section>

      {/* ── C. Legacy 9-box (collapsible-feeling, kept for HR reporting) ── */}
      <section className="space-y-4 mt-6 pt-4 border-t border-gray-100">
        <div className="flex items-center gap-2">
          <Circle className="w-3.5 h-3.5 text-gray-400" />
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">9-Box (Legacy)</h3>
        </div>

        <Field label="Potential">
          <div className="grid grid-cols-3 gap-2">
            {(["low", "medium", "high"] as PotentialBand[]).map((v) => (
              <Pill
                key={v}
                selected={potential === v}
                onClick={() => setPotential(v)}
                colors={{ active: v === "high" ? "bg-purple-100 text-purple-700 border-purple-300" : v === "medium" ? "bg-accent-100 text-accent-700 border-accent-300" : "bg-gray-200 text-gray-700 border-gray-300" }}
              >
                {POTENTIAL_LABELS[v]}
              </Pill>
            ))}
          </div>
        </Field>

        <Field label="Flight Risk">
          <div className="grid grid-cols-3 gap-2">
            {(["low", "medium", "high"] as FlightRisk[]).map((v) => (
              <Pill
                key={v}
                selected={flightRisk === v}
                onClick={() => setFlightRisk(v)}
                colors={{ active: v === "high" ? "bg-red-100 text-red-700 border-red-300" : v === "medium" ? "bg-amber-100 text-amber-800 border-amber-300" : "bg-green-100 text-green-700 border-green-300" }}
              >
                {FLIGHT_LABELS[v]}
              </Pill>
            ))}
          </div>
        </Field>

        <Field label="Succession Readiness">
          <div className="grid grid-cols-3 gap-2">
            {(["not-ready", "developing", "ready-now"] as Succession[]).map((v) => (
              <Pill
                key={v}
                selected={succession === v}
                onClick={() => setSuccession(v)}
                colors={{ active: v === "ready-now" ? "bg-green-100 text-green-700 border-green-300" : v === "developing" ? "bg-accent-100 text-accent-700 border-accent-300" : "bg-gray-200 text-gray-600 border-gray-300" }}
              >
                {SUCCESSION_LABELS[v]}
              </Pill>
            ))}
          </div>
        </Field>

        <Field label="Skills & Competencies">
          <div className="flex gap-2 mb-2">
            <input
              value={skillInput}
              onChange={(e) => setSkillInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSkill()}
              placeholder="Add skill…"
              className="flex-1 border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none focus:border-accent-400"
            />
            <button onClick={addSkill} className="p-1.5 bg-accent-50 hover:bg-accent-100 rounded border border-accent-200">
              <Plus className="w-3.5 h-3.5 text-accent-600" />
            </button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {skills.map((s) => (
              <span key={s} className="flex items-center gap-1 bg-accent-50 text-accent-700 border border-accent-200 text-xs px-2 py-0.5 rounded-full">
                {s}
                <button onClick={() => setSkills(skills.filter((x) => x !== s))}>
                  <X className="w-2.5 h-2.5" />
                </button>
              </span>
            ))}
            {skills.length === 0 && <p className="text-xs text-gray-400">No skills added yet</p>}
          </div>
        </Field>

        <Field label="Development Notes">
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={4}
            placeholder="Growth areas, coaching notes…"
            className="w-full border border-gray-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-accent-400 resize-none"
          />
        </Field>
      </section>
    </RightPanel>
  );
}

// ─── Drawer helpers ──────────────────────────────────────────────────────────

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-start gap-1 mb-2">
        <label className="block text-xs font-semibold text-gray-700">{label}</label>
        {help && (
          <span title={help} className="text-gray-300 hover:text-gray-500 cursor-help">
            <HelpCircle className="w-3 h-3" />
          </span>
        )}
      </div>
      {children}
    </div>
  );
}

function Pill({
  selected, onClick, colors, children,
}: {
  selected: boolean;
  onClick: () => void;
  colors: { active: string };
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`py-1.5 text-xs font-medium rounded border transition-all ${selected ? colors.active : "bg-white border-gray-200 text-gray-600 hover:border-gray-300"}`}
    >
      {children}
    </button>
  );
}

function SignalTile({ label, value, suffix, subtitle }: { label: string; value: number | null; suffix: string; subtitle: string }) {
  return (
    <div className="px-3 py-2 rounded-lg border border-gray-200 bg-white">
      <p className="text-[10px] text-gray-400 font-medium uppercase tracking-wide">{label}</p>
      <p className="text-sm font-bold text-gray-800 mt-0.5">
        {value === null ? <span className="text-gray-300">—</span> : `${value}${suffix}`}
      </p>
      {subtitle && <p className="text-[10px] text-gray-400 mt-0.5">{subtitle}</p>}
    </div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function TalentAssessmentPage() {
  const { data, isLoading: loading } = useTalent();
  const people = (data as Person[]) ?? [];
  const [view, setView] = useState<"dashboard" | "scaling-up" | "list">("dashboard");
  const [showBenchmark, setShowBenchmark] = useState(false);

  // Org benchmark cut-lines for the quadrant.
  const { data: benchmark } = useTalentBenchmark();
  const perfCut = benchmark?.perfCut ?? 50;
  const potentialCut = benchmark?.potentialCut ?? 50;
  const [selected, setSelected] = useState<Person | null>(null);
  const [quarterFilter, setQuarterFilter] = useState("Q1");
  const [yearFilter, setYearFilter] = useState(new Date().getFullYear());

  // Summary stats — Scaling-Up-flavoured
  const aPlayers     = people.filter((p) => p.classification === "A").length;
  const cPlayers     = people.filter((p) => p.classification === "C").length;
  const enthusiastic = people.filter((p) => p.rehireDecision === "enthusiastic").length;
  const unrated      = people.filter((p) => p.rehireDecision === "unrated").length;

  if (loading)
    return (
      <div className="p-6 space-y-4">
        {[1, 2, 3].map((i) => <div key={i} className="h-10 bg-gray-100 rounded animate-pulse" />)}
      </div>
    );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-sm font-bold text-gray-900">Talent Assessment</h1>
          <p className="text-xs text-gray-400 mt-0.5">
            Dashboard · Scaling Up A/B/C players · List
          </p>
        </div>
        <div className="flex items-center gap-3">
          <select value={quarterFilter} onChange={(e) => setQuarterFilter(e.target.value)} className="border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none">
            {["Q1", "Q2", "Q3", "Q4"].map((q) => <option key={q}>{q}</option>)}
          </select>
          <select value={yearFilter} onChange={(e) => setYearFilter(Number(e.target.value))} className="border border-gray-200 rounded px-2.5 py-1.5 text-xs focus:outline-none">
            {[yearFilter - 1, yearFilter, yearFilter + 1].map((y) => <option key={y}>{y}</option>)}
          </select>
          <button
            onClick={() => setShowBenchmark(true)}
            title="Benchmark settings (A/B/C/D cut-lines)"
            className="flex items-center gap-1.5 px-2.5 py-1.5 border border-gray-200 rounded text-xs text-gray-600 hover:bg-gray-50"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" /> Benchmark
          </button>
          <div className="flex border border-gray-200 rounded overflow-hidden">
            <button onClick={() => setView("dashboard")} title="Dashboard" className={`px-2 py-1.5 ${view === "dashboard" ? "bg-accent-600 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}>
              <LayoutDashboard className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setView("scaling-up")} title="Scaling Up" className={`px-2 py-1.5 ${view === "scaling-up" ? "bg-accent-600 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}>
              <Sparkles className="w-3.5 h-3.5" />
            </button>
            <button onClick={() => setView("list")} title="List" className={`px-2 py-1.5 ${view === "list" ? "bg-accent-600 text-white" : "bg-white text-gray-400 hover:bg-gray-50"}`}>
              <List className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Summary cards */}
      <div className="px-6 py-3 grid grid-cols-4 gap-3 flex-shrink-0">
        {[
          { label: "Total People", value: people.length, icon: Users, color: "text-accent-600 bg-accent-50" },
          { label: "A Players",    value: aPlayers,      icon: TrendingUp, color: "text-green-600 bg-green-50" },
          { label: "Enthusiastic Rehires", value: `${enthusiastic}/${people.length}`, icon: Star, color: "text-purple-600 bg-purple-50" },
          { label: "C / At-risk",  value: cPlayers,      icon: AlertTriangle, color: "text-red-600 bg-red-50" },
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

      {/* Unrated banner */}
      {unrated > 0 && view === "scaling-up" && (
        <div className="mx-6 mb-3 px-4 py-2 bg-amber-50 border border-amber-200 rounded-lg flex items-center justify-between flex-shrink-0">
          <p className="text-xs text-amber-800">
            {unrated} {unrated === 1 ? "person has" : "people have"} not been rated yet — pick a row to assess.
          </p>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 overflow-y-auto px-6 pb-6 min-h-0">
        {view === "dashboard" ? (
          <DashboardView
            people={people.map((p) => ({
              userId: p.userId, firstName: p.firstName, lastName: p.lastName, teamName: p.teamName,
              performanceScore: p.performanceScore, potentialScore: p.potentialScore, classification: p.classification,
              kpiScore: p.kpiScore, rehireDecision: p.rehireDecision, coreValuesScore: p.coreValuesScore,
            }))}
            onSelect={(userId) => { const f = people.find((p) => p.userId === userId); if (f) setSelected(f); }}
            perfCut={perfCut}
            potentialCut={potentialCut}
          />
        ) : view === "scaling-up" ? (
          <ScalingUpView people={people} onSelect={setSelected} />
        ) : (
          <ListView people={people} onSelect={setSelected} />
        )}
      </div>

      {selected && (
        <AssessmentDrawer
          person={selected}
          onClose={() => setSelected(null)}
          currentQuarter={quarterFilter}
          currentYear={yearFilter}
        />
      )}

      {showBenchmark && (
        <BenchmarkPanel
          currentPerfCut={perfCut}
          currentPotentialCut={potentialCut}
          isDefault={benchmark?.isDefault ?? true}
          onClose={() => setShowBenchmark(false)}
        />
      )}
    </div>
  );
}

// ─── Benchmark settings panel (A/B/C/D cut-lines) ────────────────────────────

function BenchmarkPanel({
  currentPerfCut, currentPotentialCut, isDefault, onClose,
}: {
  currentPerfCut: number;
  currentPotentialCut: number;
  isDefault: boolean;
  onClose: () => void;
}) {
  const [perf, setPerf] = useState(currentPerfCut);
  const [pot, setPot] = useState(currentPotentialCut);
  const [error, setError] = useState<string | null>(null);
  const update = useUpdateTalentBenchmark();

  async function save() {
    setError(null);
    const res = await update.mutateAsync({ perfCut: perf, potentialCut: pot });
    if (res?.success === false) { setError(res.error ?? "Failed to save"); return; }
    onClose();
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md">
        <div className="px-6 pt-5 pb-3 border-b border-gray-100">
          <h2 className="text-sm font-semibold text-gray-900">Talent Benchmarks</h2>
          <p className="text-[11px] text-gray-500 mt-0.5">
            Set the cut-lines that decide A / B / C / D. A score at or above the cut counts as “high”. {isDefault && "Currently using defaults (50 / 50)."}
          </p>
        </div>
        <div className="px-6 py-5 space-y-6">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700">High Performance ≥</label>
              <span className="text-sm font-bold text-accent-700">{perf}</span>
            </div>
            <input type="range" min={0} max={100} step={5} value={perf} onChange={(e) => setPerf(Number(e.target.value))} className="w-full accent-accent-600" />
            <p className="text-[10px] text-gray-400 mt-1">People with performance ≥ {perf} fall on the right (A / C).</p>
          </div>
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-semibold text-gray-700">High Potential ≥</label>
              <span className="text-sm font-bold text-accent-700">{pot}</span>
            </div>
            <input type="range" min={0} max={100} step={5} value={pot} onChange={(e) => setPot(Number(e.target.value))} className="w-full accent-accent-600" />
            <p className="text-[10px] text-gray-400 mt-1">People with potential ≥ {pot} fall on top (A / B).</p>
          </div>

          {/* Mini preview of the four cells */}
          <div className="grid grid-cols-2 gap-1 text-[10px] font-semibold">
            <div className="bg-amber-50 text-amber-700 border border-amber-200 rounded p-2">B · Future<br /><span className="font-normal text-gray-400">perf &lt; {perf} · pot ≥ {pot}</span></div>
            <div className="bg-green-50 text-green-700 border border-green-200 rounded p-2">A · Stars<br /><span className="font-normal text-gray-400">perf ≥ {perf} · pot ≥ {pot}</span></div>
            <div className="bg-red-50 text-red-700 border border-red-200 rounded p-2">D · At risk<br /><span className="font-normal text-gray-400">perf &lt; {perf} · pot &lt; {pot}</span></div>
            <div className="bg-blue-50 text-blue-700 border border-blue-200 rounded p-2">C · Specialist<br /><span className="font-normal text-gray-400">perf ≥ {perf} · pot &lt; {pot}</span></div>
          </div>

          {error && (
            <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" /> {error}
            </div>
          )}
        </div>
        <div className="flex justify-end gap-2 px-6 py-3 border-t border-gray-100">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-md">Cancel</button>
          <button onClick={save} disabled={update.isPending} className="px-4 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-md disabled:opacity-50">
            {update.isPending ? "Saving…" : "Save benchmarks"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Scaling-Up View (table-style, headline A/B/C per person) ────────────────

function ScalingUpView({ people, onSelect }: { people: Person[]; onSelect: (p: Person) => void }) {
  const [search, setSearch] = useState("");
  const filtered = people
    .filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => {
      // A > B > C > null
      const rank = (c: Classification) => (c === "A" ? 0 : c === "B" ? 1 : c === "C" ? 2 : 3);
      return rank(a.classification) - rank(b.classification);
    });

  return (
    <div className="mt-2">
      <div className="mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search people…"
          className="border border-gray-200 rounded px-3 py-1.5 text-xs w-64 focus:outline-none focus:border-accent-400"
        />
      </div>

      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="border-separate border-spacing-0 text-xs w-full">
          <thead className="sticky top-0 z-10 bg-gray-50">
            <tr>
              {["Person", "Class", "Rehire?", "Core Values", "KPI %", "Priority %", "Huddles %", "Seats", "Last Review", "Action"].map((h) => (
                <th key={h} className="border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap last:border-r-0">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="text-center py-10 text-xs text-gray-400">No people found</td></tr>
            )}
            {filtered.map((p) => {
              return (
                <tr key={p.userId} className="hover:bg-accent-50/30 transition-colors group">
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className={`w-7 h-7 rounded-full ${avatarColor(p.firstName)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>
                        {initials(p)}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900">{p.firstName} {p.lastName}</p>
                        <p className="text-gray-400">{p.teamName || p.role}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">{classificationBadge(p.classification)}</td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-semibold ${REHIRE_STYLE[p.rehireDecision].bg} ${REHIRE_STYLE[p.rehireDecision].text}`}>
                      {REHIRE_STYLE[p.rehireDecision].label}
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    {p.coreValuesScore === null ? <span className="text-gray-300">—</span> : (
                      <span className={`font-semibold ${p.coreValuesScore >= 4 ? "text-green-700" : p.coreValuesScore === 3 ? "text-amber-700" : "text-red-700"}`}>
                        {p.coreValuesScore}/5
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">{metric(p.kpiScore)}</td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">{metric(p.priorityScore)}</td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">{metric(p.huddleAttendancePct)}</td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    <span className={`font-semibold ${p.seatsOwned > 1 ? "text-amber-700" : "text-gray-700"}`}>{p.seatsOwned}</span>
                  </td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    {p.lastReviewScore !== null ? (
                      <span className="font-semibold">{p.lastReviewScore.toFixed(1)}<span className="text-gray-400 font-normal text-[10px] ml-1">{p.lastReviewPeriod}</span></span>
                    ) : <span className="text-gray-300">—</span>}
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100">
                    <button onClick={() => onSelect(p)} className="px-2.5 py-1 bg-accent-50 hover:bg-accent-100 text-accent-600 text-xs font-medium rounded border border-accent-200 transition-colors">
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

// ─── List View ───────────────────────────────────────────────────────────────

function ListView({ people, onSelect }: { people: Person[]; onSelect: (p: Person) => void }) {
  const [search, setSearch] = useState("");
  const filtered = people.filter((p) => `${p.firstName} ${p.lastName}`.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="mt-2">
      <div className="mb-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search people…"
          className="border border-gray-200 rounded px-3 py-1.5 text-xs w-64 focus:outline-none focus:border-accent-400"
        />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <table className="border-separate border-spacing-0 text-xs w-full">
          <thead className="sticky top-0 z-10">
            <tr>
              {["#", "Name", "Team", "Performance", "Potential", "Box", "Flight Risk", "Succession", "Skills", "Action"].map((h) => (
                <th key={h} className="bg-accent-50 border-b border-r border-gray-200 px-3 py-2 text-left text-xs font-semibold text-gray-500 whitespace-nowrap last:border-r-0">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={10} className="text-center py-10 text-xs text-gray-400">No people found</td></tr>
            )}
            {filtered.map((p, i) => {
              const pot = p.potential || "medium";
              const box = BOX_LABELS[boxKey(p.perfBand, pot as PotentialBand)]!;
              return (
                <tr key={p.userId} className="hover:bg-accent-50/30 transition-colors group">
                  <td className="px-3 py-2 border-b border-r border-gray-100 text-gray-400">{i + 1}</td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    <div className="flex items-center gap-2">
                      <div className={`w-6 h-6 rounded-full ${avatarColor(p.firstName)} flex items-center justify-center text-white text-xs font-bold flex-shrink-0`}>{initials(p)}</div>
                      <div>
                        <p className="font-medium text-gray-900">{p.firstName} {p.lastName}</p>
                        <p className="text-gray-400">{p.email}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 border-b border-r border-gray-100 text-gray-600">{p.teamName || "—"}</td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${p.perfBand === "high" ? "bg-green-100 text-green-700" : p.perfBand === "medium" ? "bg-accent-100 text-accent-700" : "bg-red-100 text-red-700"}`}>
                      {p.performanceScore !== null ? `${p.performanceScore}%` : "—"} ({p.perfBand})
                    </span>
                  </td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    {p.potential ? (
                      <span className={`px-1.5 py-0.5 rounded text-xs font-medium ${p.potential === "high" ? "bg-purple-100 text-purple-700" : p.potential === "medium" ? "bg-accent-100 text-accent-700" : "bg-gray-100 text-gray-600"}`}>
                        {POTENTIAL_LABELS[p.potential]}
                      </span>
                    ) : <span className="text-gray-300">Not set</span>}
                  </td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    <span className={`px-1.5 py-0.5 rounded text-xs font-medium border ${box.bg} ${box.border} ${box.text}`}>{box.label}</span>
                  </td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">{flightBadge(p.flightRisk)}</td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">{successionBadge(p.successionReady)}</td>
                  <td className="px-3 py-2 border-b border-r border-gray-100">
                    <div className="flex flex-wrap gap-1">
                      {p.skills.slice(0, 3).map((s) => (
                        <span key={s} className="bg-accent-50 text-accent-600 border border-accent-100 text-xs px-1.5 py-0.5 rounded-full">{s}</span>
                      ))}
                      {p.skills.length > 3 && <span className="text-gray-400 text-xs">+{p.skills.length - 3}</span>}
                      {p.skills.length === 0 && <span className="text-gray-300">—</span>}
                    </div>
                  </td>
                  <td className="px-3 py-2 border-b border-gray-100">
                    <button onClick={() => onSelect(p)} className="px-2.5 py-1 bg-accent-50 hover:bg-accent-100 text-accent-600 text-xs font-medium rounded border border-accent-200 transition-colors">
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
