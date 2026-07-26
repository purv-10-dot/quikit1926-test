/**
 * Trigger catalog — DERIVED from the module registry (lib/catalog/modules).
 *
 * This file used to hand-list every event; it is now a thin projection of the
 * registry into the `CatalogApp → CatalogEvent` shape the builder's cascading
 * picker consumes. The registry is the single source of truth; editing a
 * module's events here is impossible by design — edit the module file instead.
 *
 * `live` marks events QuikScale actually emits today (only `kpi.below_target`,
 * via apps/quikscale/lib/services/workflowEvents.ts). Everything else is
 * authorable now and shows a "planned" badge until an emitter exists. Other apps
 * are stubbed ("coming soon"); v1 integrates QuikScale.
 */
import { MODULES, MODULE_APP } from "./modules";
import { MAIL_APP } from "./mail";

export type Pillar = "Global" | "Execution" | "Strategy" | "People" | "AI" | "Admin";
export type EventScope = "Org" | "User" | "Workflow";

export interface CatalogEvent {
  id: string;
  label: string;
  /** Display group in the picker — the owning module's label. */
  module: string;
  firesWhen: string;
  payloadFields: string[];
  /** Retained for back-compat; optional now that grouping is by module. */
  pillar?: Pillar;
  scope?: EventScope;
  /** QuikScale emits this end-to-end today. */
  live?: boolean;
}

export interface CatalogApp {
  slug: string;
  name: string;
  comingSoon?: boolean;
  events: CatalogEvent[];
}

/** Flatten every module's events into the picker's flat CatalogEvent list. */
const QUIKSCALE_EVENTS: CatalogEvent[] = MODULES.flatMap((m) =>
  m.events.map((e) => ({
    id: e.id,
    label: e.label,
    module: m.label,
    firesWhen: e.firesWhen,
    payloadFields: e.payloadFields,
    live: e.live,
  })),
);

export const TRIGGER_CATALOG: CatalogApp[] = [
  { slug: MODULE_APP.slug, name: MODULE_APP.name, events: QUIKSCALE_EVENTS },
  MAIL_APP,
  { slug: "quikcrm", name: "QuikCRM", comingSoon: true, events: [] },
  { slug: "quikhrms", name: "QuikHRMS", comingSoon: true, events: [] },
  { slug: "quikinfra", name: "QuikInfra", comingSoon: true, events: [] },
  { slug: "quiktrack", name: "QuikTrack", comingSoon: true, events: [] },
];
