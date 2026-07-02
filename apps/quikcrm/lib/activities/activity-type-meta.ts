import type { LucideIcon } from "lucide-react";
import {
  Calendar,
  FileText,
  Mail,
  Phone,
  CheckSquare,
} from "lucide-react";
import type { GenericActivityType } from "@/lib/services/activities/generic-activity-types";

export type ActivityVisibility = "private" | "team" | "public";

export const ACTIVITY_TYPE_META: Record<
  GenericActivityType,
  {
    icon: LucideIcon;
    ring: string;
    chip: string;
    accent: string;
  }
> = {
  Note: {
    icon: FileText,
    ring: "ring-slate-200",
    chip: "bg-slate-100 text-slate-700",
    accent: "text-slate-600",
  },
  Call: {
    icon: Phone,
    ring: "ring-blue-200",
    chip: "bg-blue-50 text-blue-700",
    accent: "text-blue-600",
  },
  Email: {
    icon: Mail,
    ring: "ring-emerald-200",
    chip: "bg-emerald-50 text-emerald-700",
    accent: "text-emerald-600",
  },
  Meeting: {
    icon: Calendar,
    ring: "ring-violet-200",
    chip: "bg-violet-50 text-violet-700",
    accent: "text-violet-600",
  },
  Task: {
    icon: CheckSquare,
    ring: "ring-amber-200",
    chip: "bg-amber-50 text-amber-800",
    accent: "text-amber-600",
  },
};

export const NOTE_TEMPLATES = [
  { label: "Interested customer", text: "Customer showed interest and asked for more details." },
  { label: "Follow-up required", text: "Follow-up required — schedule next touchpoint." },
  { label: "Demo scheduled", text: "Product demo scheduled with the decision maker." },
  { label: "No answer", text: "Attempted contact — no answer. Will retry." },
] as const;

export const VISIBILITY_OPTIONS: { value: ActivityVisibility; label: string }[] = [
  { value: "private", label: "Self" },
  { value: "team", label: "Team" },
  { value: "public", label: "Public" },
];

export function formatVisibilityPrefix(v: ActivityVisibility): string {
  return `[Visibility: ${v === "private" ? "Private" : v === "team" ? "Team" : "Public"}]`;
}

export function sourceBadgeClass(source: string): string {
  const s = source.toLowerCase();
  if (s.includes("facebook") || s.includes("meta")) return "bg-indigo-50 text-indigo-700 ring-indigo-200";
  if (s.includes("csv") || s.includes("import")) return "bg-amber-50 text-amber-800 ring-amber-200";
  if (s.includes("whatsapp")) return "bg-green-50 text-green-800 ring-green-200";
  if (s.includes("web")) return "bg-sky-50 text-sky-800 ring-sky-200";
  if (s.includes("api")) return "bg-slate-100 text-slate-700 ring-slate-200";
  return "bg-accent-50 text-accent-800 ring-accent-200";
}
