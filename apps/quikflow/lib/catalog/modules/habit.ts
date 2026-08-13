import type { ModuleDef } from "./types";
import { auditFields } from "./audit-fields";

/**
 * Habits — doc §1.4. Backed by HabitAssessment. The per-respondent `response`
 * and `participation` are computed from HabitAssessmentResponse rows and arrive
 * on the event payload; the assessment-level score/maturity are column-backed.
 */
export const HABIT_MODULE: ModuleDef = {
  key: "habit",
  label: "Habits",
  recordNoun: "a habit",
  capabilities: { trigger: true, condition: true, action: false },
  binding: { model: "habitAssessment", softDelete: false, readable: true },
  fields: [
    {
      key: "status",
      label: "Status",
      type: "status",
      usableIn: ["trigger", "condition"],
      values: ["draft", "published", "closed"],
      column: "status",
    },
    { key: "response", label: "Habit response", type: "dropdown", usableIn: ["trigger", "condition"], values: ["yes", "no"], derived: true, description: "A single check-in answer (Yes/No or 1–5)." },
    { key: "participationPct", label: "Participation %", type: "number", usableIn: ["condition"], derived: true },
    { key: "averageScore", label: "Average Score", type: "number", usableIn: ["condition"], column: "averageScore" },
    { key: "maturityLevel", label: "Maturity Level", type: "dropdown", usableIn: ["condition"], values: ["low", "medium", "high"], column: "maturityLevel" },
    { key: "assessedBy", label: "Assessed By", type: "people", usableIn: ["condition"], source: "master:users", column: "assessedBy" },
    { key: "quarter", label: "Quarter", type: "reference", usableIn: ["trigger", "condition"], source: "master:quarters", column: "quarter" },
    ...auditFields(),
  ],
  // doc §4.6 — none live yet.
  events: [
    { id: "habit.response.submitted", label: "A habit check-in is submitted", firesWhen: "A habit response is recorded", payloadFields: ["response", "assessedBy"] },
    { id: "habit.checkin.missed", label: "A scheduled check-in is missed", firesWhen: "No response by the deadline", payloadFields: ["assessedBy", "quarter"] },
    { id: "habit.response.no", label: "A habit response is No / below scale", firesWhen: "A negative response", payloadFields: ["response"] },
    { id: "habit.participation.low", label: "Participation is below X%", firesWhen: "Participation < threshold", payloadFields: ["participationPct"] },
    { id: "habit.streak.reached", label: "A positive streak reaches N", firesWhen: "Streak hits a milestone", payloadFields: ["streak"] },
    { id: "habit.streak.broken", label: "A streak is broken", firesWhen: "Streak resets", payloadFields: ["prevStreak"] },
    { id: "habit.missed.streak", label: "Missed N times in a row", firesWhen: "N consecutive misses", payloadFields: ["misses"] },
  ],
  actionIds: ["notify.inapp.send", "notify.email.send"],
};
