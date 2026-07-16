/**
 * Node visual metadata — the single source of truth for how each workflow node
 * `kind` is rendered (icon + chip color). Shared by the builder canvas, the
 * workflow-detail view, and the run console so styling is defined once.
 *
 * Chip colors use `accent-*` (branded UI, per CLAUDE.md); node type is conveyed
 * by the icon, not by semantic color. Run-status colors live in `run-console`.
 */
import {
  Zap,
  Cog,
  Filter,
  GitBranch,
  Clock,
  Repeat,
  CheckCircle2,
  Circle,
} from "lucide-react";

export interface NodeMeta {
  /** Uppercase category label shown above the node title. */
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  /** Tailwind classes for the icon chip background + icon color. */
  chip: string;
}

const TRIGGER_META: NodeMeta = {
  label: "Trigger",
  icon: Zap,
  chip: "bg-accent-600 text-white",
};

const STEP_META: Record<string, NodeMeta> = {
  action: { label: "Action", icon: Cog, chip: "bg-accent-100 text-accent-700" },
  condition: { label: "Condition", icon: Filter, chip: "bg-accent-100 text-accent-700" },
  if_else: { label: "If / Else", icon: GitBranch, chip: "bg-accent-100 text-accent-700" },
  wait: { label: "Wait", icon: Clock, chip: "bg-accent-100 text-accent-700" },
  loop: { label: "Loop", icon: Repeat, chip: "bg-accent-100 text-accent-700" },
  approval: { label: "Approval", icon: CheckCircle2, chip: "bg-accent-100 text-accent-700" },
};

const FALLBACK: NodeMeta = { label: "Step", icon: Circle, chip: "bg-accent-100 text-accent-700" };

/** Visual metadata for a node kind; `trigger` is special-cased, others fall back. */
export function nodeMeta(kind: string): NodeMeta {
  if (kind === "trigger") return TRIGGER_META;
  return STEP_META[kind] ?? FALLBACK;
}
