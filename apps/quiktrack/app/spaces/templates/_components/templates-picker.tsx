"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { X } from "lucide-react";
import {
  KanbanIllustration,
  WebDesignIllustration,
  ScrumIllustration,
} from "@/components/create-space/template-illustrations";

type TemplateKey =
  | "scrum"
  | "general-service-management"
  | "development-requests"
  | "kanban"
  | "cross-team-planning"
  | "process-control";

interface Template {
  key: TemplateKey;
  title: string;
  description: string;
  badge?: { label: string; tone: "blue" | "amber" | "purple" };
  Illustration: (p: { className?: string }) => JSX.Element;
  enabled: boolean;
  product: string;
}

const TEMPLATES: Template[] = [
  {
    key: "scrum",
    title: "Scrum",
    description: "Plan, track, and execute work using sprints and a backlog.",
    badge: { label: "LAST CREATED", tone: "blue" },
    Illustration: ScrumIllustration,
    enabled: true,
    product: "QuikTrack",
  },
  {
    key: "general-service-management",
    title: "General service management",
    description: "Create one place to collect and manage any type of request.",
    Illustration: WebDesignIllustration,
    enabled: false,
    product: "Service Management",
  },
  {
    key: "development-requests",
    title: "Development requests",
    description: "Easily sync new feature requests, bugs, and incidents with your backlog.",
    Illustration: WebDesignIllustration,
    enabled: false,
    product: "Service Management",
  },
  {
    key: "kanban",
    title: "Kanban",
    description: "Work efficiently and visualize work on a board with to do, doing, and done.",
    Illustration: KanbanIllustration,
    enabled: false,
    product: "QuikTrack",
  },
  {
    key: "cross-team-planning",
    title: "Cross-team planning",
    description: "Align teams on shared goals and timelines.",
    badge: { label: "PREMIUM", tone: "amber" },
    Illustration: KanbanIllustration,
    enabled: false,
    product: "QuikTrack",
  },
  {
    key: "process-control",
    title: "Process control",
    description: "Track and improve recurring workflows.",
    Illustration: ScrumIllustration,
    enabled: false,
    product: "QuikTrack",
  },
];

const NAV_ITEMS = [
  { key: "made-for-you", label: "Made for you" },
];

function BadgeChip({ tone, label }: { tone: "blue" | "amber" | "purple"; label: string }) {
  const cls =
    tone === "amber"
      ? "bg-amber-100 text-amber-800 border-amber-200"
      : tone === "purple"
        ? "bg-purple-100 text-purple-800 border-purple-200"
        : "bg-blue-50 text-blue-700 border-blue-200";
  return (
    <span
      className={`inline-flex items-center text-[10px] font-semibold tracking-wider uppercase border rounded px-1.5 py-0.5 ${cls}`}
    >
      {label}
    </span>
  );
}

export function TemplatesPicker() {
  const router = useRouter();
  const [activeNav, setActiveNav] = useState("made-for-you");

  function handleSelect(t: Template) {
    if (!t.enabled) return;
    router.push(`/spaces/new?template=${t.key}`);
  }

  return (
    <div className="flex h-screen bg-white">
      {/* ── Left sidebar ─────────────────────────────────────────────── */}
      <aside className="w-[280px] shrink-0 border-r border-gray-200 flex flex-col overflow-y-auto">
        <div className="p-4">
          <button
            onClick={async () => {
              const lastId =
                typeof window !== "undefined"
                  ? window.localStorage.getItem("qt:lastProjectId")
                  : null;
              if (lastId) {
                router.push(`/spaces/${lastId}/backlog`);
                return;
              }
              try {
                const res = await fetch("/api/projects");
                const json = await res.json();
                const first = json?.success && json.data?.[0];
                router.push(first ? `/spaces/${first.id}/backlog` : "/spaces");
              } catch {
                router.push("/spaces");
              }
            }}
            className="p-1.5 rounded hover:bg-gray-100 text-gray-600"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
          <h1 className="mt-6 text-2xl font-semibold text-gray-900">Space templates</h1>
        </div>

        <nav className="px-2 mt-2 space-y-0.5">
          {NAV_ITEMS.map((item) => {
            const active = activeNav === item.key;
            return (
              <button
                key={item.key}
                onClick={() => setActiveNav(item.key)}
                className={`w-full flex items-center justify-between gap-2 px-3 h-9 text-sm rounded ${
                  active
                    ? "bg-blue-50 text-blue-700 font-medium"
                    : "text-gray-700 hover:bg-gray-100"
                }`}
              >
                <span className="flex items-center gap-2">{item.label}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ── Main content ────────────────────────────────────────────── */}
      <main className="flex-1 overflow-y-auto">
        <div className="px-12 py-8 max-w-[1400px]">
          <div className="text-sm text-gray-500">Space templates</div>
          <h2 className="mt-4 text-2xl font-semibold text-gray-900">
            {activeNav === "made-for-you" ? "Made for you" : activeNav.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())}
          </h2>
          <p className="mt-2 text-sm text-gray-600">
            Templates for you based on how similar teams work.
          </p>

          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {/* Coming-soon templates (t.enabled === false) are hidden until ready. */}
            {TEMPLATES.filter((t) => t.enabled).map((t) => (
              <button
                key={t.key}
                onClick={() => handleSelect(t)}
                disabled={!t.enabled}
                className={`flex flex-col text-left bg-white border rounded-lg p-5 transition relative ${
                  t.enabled
                    ? "border-gray-200 hover:border-blue-400 hover:shadow-md cursor-pointer"
                    : "border-gray-200 opacity-60 cursor-not-allowed"
                }`}
              >
                <div className="h-[150px] flex items-center justify-center mb-4">
                  <t.Illustration className="max-h-[150px]" />
                </div>
                <div className="flex items-center gap-2">
                  <h3 className="text-base font-semibold text-gray-900">{t.title}</h3>
                  {t.badge && <BadgeChip tone={t.badge.tone} label={t.badge.label} />}
                  {!t.enabled && (
                    <BadgeChip tone="purple" label="COMING SOON" />
                  )}
                </div>
                <p className="mt-2 text-sm text-gray-600 leading-snug">{t.description}</p>
                <div className="mt-4 flex items-center gap-1.5 text-xs text-gray-500">
                  <span className="h-3.5 w-3.5 rounded-sm bg-blue-600 inline-flex items-center justify-center text-[8px] font-bold text-white">
                    Q
                  </span>
                  {t.product}
                </div>
              </button>
            ))}
          </div>

          <div className="h-16" />
        </div>
      </main>
    </div>
  );
}
