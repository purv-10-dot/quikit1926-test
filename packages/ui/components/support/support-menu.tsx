"use client";

/**
 * "How can we help?" menu — the support panel's default view.
 *
 * All three options are ACTIVE. The reference widget this was ported from
 * shipped the guide and request tiles disabled behind a "Soon" badge because it
 * had no backend; the request tile now posts to a real endpoint.
 */

import { FileText, HelpCircle, ListChecks, Sparkles } from "lucide-react";
import type { SupportView } from "./types";

const OPTIONS: {
  view: Exclude<SupportView, "menu">;
  icon: typeof FileText;
  label: string;
  desc: (appName: string) => string;
}[] = [
  {
    view: "guide",
    icon: FileText,
    label: "Read the guide",
    desc: (appName) => `Step-by-step help on how to get the most out of ${appName}.`,
  },
  {
    view: "chat",
    icon: Sparkles,
    label: "Ask the AI Copilot",
    desc: (appName) => `Chat with the assistant for instant answers on how ${appName} works.`,
  },
  {
    view: "request",
    icon: HelpCircle,
    label: "Raise a request",
    desc: () => "Report an issue or ask our team for help — we'll get back to you shortly.",
  },
  {
    view: "requests",
    icon: ListChecks,
    label: "Track your requests",
    desc: () => "See everything you've raised, its current status and our latest reply.",
  },
];

export function SupportMenu({
  appName,
  onSelect,
}: {
  appName: string;
  onSelect: (view: SupportView) => void;
}) {
  return (
    <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2">
      {OPTIONS.map(({ view, icon: Icon, label, desc }) => (
        <button
          key={view}
          type="button"
          onClick={() => onSelect(view)}
          className="w-full flex items-start gap-3 text-left p-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-primary)] hover:border-accent-300 hover:bg-accent-50/50 transition-colors focus:outline-none focus:ring-2 focus:ring-accent-400"
        >
          <span className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-accent-100 text-accent-700">
            <Icon className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-medium text-[var(--color-text-primary)]">
              {label}
            </span>
            <span className="block text-xs text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">
              {desc(appName)}
            </span>
          </span>
        </button>
      ))}
    </div>
  );
}
