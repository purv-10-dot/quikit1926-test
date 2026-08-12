import type { ModuleDef } from "./types";

/**
 * Global · Time & Comments — cross-cutting triggers that are not tied to a
 * single data module (doc §2). `schedule.tick` is produced by QuikFlow's own
 * scheduler; `comment.posted` fires from any record's comment thread. No record
 * reads (`readable: false`); trigger-only.
 */
export const GLOBAL_MODULE: ModuleDef = {
  key: "global",
  label: "Global · Time & Comments",
  recordNoun: "an event",
  capabilities: { trigger: true, condition: false, action: false },
  binding: { readable: false },
  fields: [
    { key: "recurrence", label: "Recurrence", type: "dropdown", usableIn: ["trigger"], values: ["every_day", "every_weekday", "every_week", "every_month", "every_quarter", "every_year"] },
    { key: "time", label: "Time of day", type: "text", usableIn: ["trigger"], description: "HH:MM in org timezone." },
    { key: "module", label: "Source module", type: "text", usableIn: ["trigger"] },
  ],
  // doc §4.11 — cross-cutting. None emitted end-to-end yet (no scheduler /
  // comment bridge), so all authorable-but-planned.
  events: [
    { id: "schedule.tick", label: "A schedule fires (time trigger)", firesWhen: "On the configured recurrence (e.g. every Monday 09:00)", payloadFields: ["recurrence", "time"], live: true },
    { id: "comment.posted", label: "A comment is added on any record", firesWhen: "A comment is posted on a record", payloadFields: ["module", "recordId"] },
    { id: "mention.added", label: "Someone is @mentioned", firesWhen: "A user is @mentioned", payloadFields: ["target", "byWhom"] },
    { id: "record.created.any", label: "Any record of a chosen module is created", firesWhen: "A record is created in a chosen module", payloadFields: ["module"] },
    { id: "field.changed.any", label: "Any chosen field changes", firesWhen: "A watched field changes", payloadFields: ["module", "field"] },
    { id: "user.added", label: "A user is added to the org (Org Setup)", firesWhen: "New org member", payloadFields: ["user"] },
    { id: "quarter.started", label: "A new quarter starts", firesWhen: "Quarter rollover", payloadFields: ["quarter"] },
    { id: "week.started", label: "A new week starts", firesWhen: "Week rollover", payloadFields: ["week"] },
  ],
  actionIds: [],
};
