import type { ModuleDef } from "./types";

/**
 * Scorecard — doc §1.4. Aggregated view with no dedicated table; authorable via
 * inline enums, not readable in v1. Condition/trigger only (no direct actions).
 */
export const SCORECARD_MODULE: ModuleDef = {
  key: "scorecard",
  label: "Scorecard",
  recordNoun: "a scorecard",
  capabilities: { trigger: true, condition: true, action: false },
  binding: { readable: false },
  fields: [
    { key: "period", label: "Period", type: "dropdown", usableIn: ["trigger", "condition"], values: ["weekly", "monthly", "quarterly", "annual"] },
    { key: "overallRag", label: "Overall Health Status (Red / Yellow / Green)", type: "status", usableIn: ["trigger", "condition"], values: ["red", "yellow", "green"] },
    { key: "weekLabel", label: "Week label", type: "text", usableIn: ["condition"] },
    { key: "trend", label: "Trend", type: "dropdown", usableIn: ["condition"], values: ["up", "flat", "down"] },
  ],
  events: [],
  actionIds: [],
};
