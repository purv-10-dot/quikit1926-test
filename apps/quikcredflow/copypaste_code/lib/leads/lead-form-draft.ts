import type { PhoneValue } from "@/components/leads/phone-field";

/** sessionStorage key — one draft blob keyed by scope inside. */
export const LEAD_FORM_DRAFT_STORAGE_KEY = "quikcrm.lead-form.draft.v1";

/** Set only when leaving the form via + Lead sources / + Add Stage / + Add Status. */
export const LEAD_FORM_PENDING_RETURN_KEY = "quikcrm.lead-form.pending-return.v1";

export type LeadFormDraftScope =
  | "create"
  | "create:page"
  | `create:account:${string}`;

export interface LeadFormDraftValues {
  name: string;
  email: string;
  company: string;
  phone: PhoneValue;
  mobile: PhoneValue;
  jobTitle: string;
  score: number;
  industry: string;
  secondaryEmail: string;
  website: string;
  linkedinUrl: string;
  annualRevenueDisplay: string;
  descriptionInformation: string;
  source: string;
  status: string;
  stage: string;
  country: string;
  addressLine1: string;
  addressLine2: string;
  cityName: string;
  stateName: string;
  postalCode: string;
  lat: string;
  long: string;
  addressOpen: boolean;
  ownerId: string;
  ownerNameRaw: string;
  followUp: string;
  accountId: string;
  accountQuery: string;
  dynValues: Record<string, unknown>;
}

interface DraftStore {
  [scope: string]: LeadFormDraftValues & { savedAt: number };
}

function canUseSessionStorage(): boolean {
  return typeof sessionStorage !== "undefined";
}

function readStore(): DraftStore {
  if (!canUseSessionStorage()) return {};
  try {
    const raw = window.sessionStorage.getItem(LEAD_FORM_DRAFT_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as DraftStore;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeStore(store: DraftStore): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(LEAD_FORM_DRAFT_STORAGE_KEY, JSON.stringify(store));
  } catch {
    /* quota / private mode */
  }
}

export function returnToForDraftScope(scope: LeadFormDraftScope): string {
  if (scope === "create") return "/leads?addLead=1";
  if (scope === "create:page") return "/leads/create";
  if (scope.startsWith("create:account:")) {
    const accountId = scope.slice("create:account:".length);
    return `/accounts/${accountId}?createLead=1`;
  }
  return "/leads";
}

export function draftScopeFromReturnTo(returnTo: string): LeadFormDraftScope | null {
  try {
    const url = new URL(returnTo, "http://local");
    if (url.pathname === "/leads/create") return "create:page";
    if (url.pathname === "/leads" && url.searchParams.get("addLead") === "1") return "create";
    const accountMatch = url.pathname.match(/^\/accounts\/([^/]+)$/);
    if (accountMatch && url.searchParams.get("createLead") === "1") {
      return `create:account:${accountMatch[1]}`;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function buildSettingsHref(settingsPath: string, returnTo: string | null): string {
  if (!returnTo) return settingsPath;
  const sep = settingsPath.includes("?") ? "&" : "?";
  return `${settingsPath}${sep}returnTo=${encodeURIComponent(returnTo)}`;
}

export function buildLeadSourcesSettingsHref(returnTo: string | null): string {
  return buildSettingsHref("/settings/sources", returnTo);
}

export function buildLeadStagesAddHref(returnTo: string | null): string {
  return buildSettingsHref("/settings/stages?focus=add-stage", returnTo);
}

export function buildLeadStatusesSettingsHref(returnTo: string | null, stage?: string): string {
  const base = `/settings/stages?focus=statuses${stage ? `&stage=${encodeURIComponent(stage)}` : ""}`;
  return buildSettingsHref(base, returnTo);
}

export function saveLeadFormDraft(scope: LeadFormDraftScope, values: LeadFormDraftValues): void {
  const store = readStore();
  store[scope] = { ...values, savedAt: Date.now() };
  writeStore(store);
}

export function loadLeadFormDraft(scope: LeadFormDraftScope): LeadFormDraftValues | null {
  const entry = readStore()[scope];
  if (!entry) return null;
  const { savedAt: _savedAt, ...values } = entry;
  return values;
}

export function clearLeadFormDraft(scope: LeadFormDraftScope): void {
  const store = readStore();
  delete store[scope];
  writeStore(store);
}

function readPendingScope(): LeadFormDraftScope | null {
  if (!canUseSessionStorage()) return null;
  try {
    const raw = window.sessionStorage.getItem(LEAD_FORM_PENDING_RETURN_KEY);
    return raw ? (raw as LeadFormDraftScope) : null;
  } catch {
    return null;
  }
}

/** Mark that the user left via a settings shortcut — restore only on return with returnTo. */
export function markPendingSettingsReturn(scope: LeadFormDraftScope): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(LEAD_FORM_PENDING_RETURN_KEY, scope);
  } catch {
    /* ignore */
  }
}

export function hasPendingSettingsReturn(scope: LeadFormDraftScope): boolean {
  return readPendingScope() === scope;
}

export function clearPendingSettingsReturn(): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(LEAD_FORM_PENDING_RETURN_KEY);
  } catch {
    /* ignore */
  }
}

/** Drop saved draft + pending flag (cancel / close / normal open). */
export function discardLeadFormDraft(scope: LeadFormDraftScope): void {
  clearLeadFormDraft(scope);
  if (readPendingScope() === scope) clearPendingSettingsReturn();
}
