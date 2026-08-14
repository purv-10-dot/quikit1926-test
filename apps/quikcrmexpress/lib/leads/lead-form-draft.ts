import type { PhoneValue } from "@/components/leads/phone-field";
import type { RequirementDetails } from "@/lib/leads/lead-type-config";

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
  leadType: string;
  firstName: string;
  lastName: string;
  contactLinkedinUrl: string;
  requirementDetails: RequirementDetails;
  source: string;
  status: string;
  substatus: string;
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
    const id = scope.slice("create:account:".length);
    return `/accounts/${id}?createLead=1`;
  }
  return "/leads";
}

export function draftScopeFromReturnTo(returnTo: string): LeadFormDraftScope | null {
  if (returnTo === "/leads?addLead=1") return "create";
  if (returnTo === "/leads/create") return "create:page";
  const m = returnTo.match(/^\/accounts\/([^/?]+)\?createLead=1$/);
  if (m) return `create:account:${m[1]}`;
  return null;
}

export function saveLeadFormDraft(scope: LeadFormDraftScope, values: LeadFormDraftValues): void {
  const store = readStore();
  store[scope] = { ...values, savedAt: Date.now() };
  writeStore(store);
}

export function loadLeadFormDraft(scope: LeadFormDraftScope): LeadFormDraftValues | null {
  const store = readStore();
  const row = store[scope];
  if (!row) return null;
  const { savedAt: _savedAt, ...values } = row;
  return values;
}

export function discardLeadFormDraft(scope: LeadFormDraftScope): void {
  const store = readStore();
  delete store[scope];
  writeStore(store);
  if (canUseSessionStorage()) {
    try {
      const pending = window.sessionStorage.getItem(LEAD_FORM_PENDING_RETURN_KEY);
      if (pending === scope) {
        window.sessionStorage.removeItem(LEAD_FORM_PENDING_RETURN_KEY);
      }
    } catch {
      /* ignore */
    }
  }
}

export function markPendingSettingsReturn(scope: LeadFormDraftScope): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.setItem(LEAD_FORM_PENDING_RETURN_KEY, scope);
  } catch {
    /* ignore */
  }
}

export function hasPendingSettingsReturn(scope: LeadFormDraftScope): boolean {
  if (!canUseSessionStorage()) return false;
  try {
    return window.sessionStorage.getItem(LEAD_FORM_PENDING_RETURN_KEY) === scope;
  } catch {
    return false;
  }
}

export function clearPendingSettingsReturn(): void {
  if (!canUseSessionStorage()) return;
  try {
    window.sessionStorage.removeItem(LEAD_FORM_PENDING_RETURN_KEY);
  } catch {
    /* ignore */
  }
}

export function buildLeadSourcesSettingsHref(returnTo: string | null): string {
  const q = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";
  return `/settings/sources${q}`;
}

export function buildLeadStagesAddHref(returnTo: string | null): string {
  const q = returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : "";
  return `/settings/stages?focus=add-stage${q}`;
}

export function buildLeadStatusesSettingsHref(returnTo: string | null, stage?: string): string {
  const params = new URLSearchParams();
  params.set("focus", "statuses");
  if (stage) params.set("stage", stage);
  if (returnTo) params.set("returnTo", returnTo);
  return `/settings/stages?${params.toString()}`;
}

export function buildSettingsHref(path: string, returnTo: string | null): string {
  if (!returnTo) return path;
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}returnTo=${encodeURIComponent(returnTo)}`;
}
