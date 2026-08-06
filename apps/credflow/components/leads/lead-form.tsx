"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useDebouncedValue } from "@/hooks/use-debounce";
import {
  parsePhoneE164,
  phoneValueToE164,
  type PhoneValue,
} from "@/components/leads/phone-field";
import type { LeadFieldDefinition } from "@/types/field-definition";
import {
  fetchCustomFieldDefs,
  fetchOwners,
  fetchSources,
  fetchPipelineConfig,
  invalidatePipelineConfigCache,
  invalidateSourcesCache,
} from "@/lib/cache/lead-form-lookups";
import {
  LeadAddressSection,
  type LeadAddressValues,
} from "@/components/leads/lead-address-section";
import {
  clearPendingSettingsReturn,
  discardLeadFormDraft,
  hasPendingSettingsReturn,
  loadLeadFormDraft,
  returnToForDraftScope,
  type LeadFormDraftScope,
  type LeadFormDraftValues,
} from "@/lib/leads/lead-form-draft";

import {
  cleanRequirementDetails,
  parseRequirementDetails,
  parseRequirementTechnology,
  validateRequirementDetails,
  type RequirementDetails,
} from "@/lib/leads/lead-type-config";
import { LeadCreateStepper } from "@/components/leads/lead-create-stepper";
import { LeadFormView } from "@/components/leads/lead-form-view";
import { LEAD_FORM_STEPS } from "@/lib/leads/lead-form-steps";
import {
  validateLeadFormStep,
  type LeadFormStepValidationInput,
} from "@/lib/leads/lead-form-step-validation";

interface AccountHit {
  id: string;
  name: string;
  segment: string;
}

interface LeadFormProps {
  initial?: Partial<{
    id: string;
    name: string;
    email: string;
    phone: string;
    mobile: string;
    company: string;
    jobTitle: string;
    source: string;
    stage: string;
    status: string;
    substatus: string;
    score: number;
    country: string;
    addressLine1: string;
    addressLine2: string;
    cityName: string;
    stateName: string;
    postalCode: string;
    lat: string;
    long: string;
    industry: string;
    secondaryEmail: string;
    website: string;
    linkedinUrl: string;
    annualRevenueDisplay: string;
    leadType: string | null;
    firstName: string | null;
    lastName: string | null;
    contactLinkedinUrl: string | null;
    requirementDetails: unknown;
    technology?: string[] | unknown;
    ownerId: string;
    ownerName: string;
    accountId: string;
    accountName: string;
    dynamicFields: Record<string, unknown> | null;
  }>;
  hideFooter?: boolean;
  submitLabel?: string;
  onSaved?: (lead: { id: string }) => void;
  onCancel?: () => void;
  formId?: string;
  onSubmittingChange?: (submitting: boolean) => void;
  /** When set on create forms, field values persist while visiting lead settings. */
  draftScope?: LeadFormDraftScope;
  /** Pre-fill owner on create (logged-in user). */
  defaultOwnerId?: string;
  defaultOwnerName?: string;
}

const DEFAULT_STAGES = ["New", "Contacted", "Qualified", "Proposal", "Negotiation", "Closed"];
const DEFAULT_STATUSES = ["Open", "Working", "Disqualified", "Converted"];
const PRIORITIES = ["Low", "Medium", "High"];
const INDUSTRY_OPTIONS = [
  "SaaS",
  "Information Technology",
  "Manufacturing",
  "Financial Services",
  "Healthcare",
  "Education",
  "Retail",
  "Real Estate",
  "Construction",
  "Logistics",
  "Telecommunications",
  "Hospitality",
  "Media & Entertainment",
  "Energy & Utilities",
  "Automotive",
  "Pharmaceuticals",
  "E-commerce",
  "Consulting",
  "Government",
  "Non-profit",
] as const;

interface OwnerOption {
  id: string;
  name: string;
  email: string;
}
interface SourceOption {
  id: string;
  name: string;
}
interface PipelineConfig {
  stages:      string[];
  statuses:    string[];
  substatuses: string[];
  dependentRules: {
    sourceToStages?:      Record<string, string[]>;
    stageToStatuses?:     Record<string, string[]>;
    statusToSubstatuses?: Record<string, string[]>;
  };
}

export function LeadForm({
  initial,
  hideFooter,
  submitLabel,
  onSaved,
  onCancel,
  formId,
  onSubmittingChange,
  draftScope,
  defaultOwnerId,
  defaultOwnerName,
}: LeadFormProps) {
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();
  const [saving, setSaving] = useState(false);

  // Definitions / lookups loaded from server
  const [defs, setDefs] = useState<LeadFieldDefinition[]>([]);
  const [owners, setOwners] = useState<OwnerOption[]>([]);
  const [sources, setSources] = useState<SourceOption[]>([]);
  const [pipeline, setPipeline] = useState<PipelineConfig>({
    stages:      DEFAULT_STAGES,
    statuses:    DEFAULT_STATUSES,
    substatuses: [],
    dependentRules: {},
  });
  // Per-resource loading flags — drive disabled/skeleton state so the layout
  // doesn't flicker between text-input fallbacks and Selects on first paint.
  const [defsLoading, setDefsLoading] = useState(true);
  const [ownersLoading, setOwnersLoading] = useState(true);
  const [sourcesLoading, setSourcesLoading] = useState(true);
  const [pipelineReady, setPipelineReady] = useState(false);
  const [autoScoreLocked, setAutoScoreLocked] = useState(false);

  // Form state — controlled because dependent rules and phone shape need it
  const [name, setName] = useState(initial?.name ?? "");
  const [email, setEmail] = useState(initial?.email ?? "");
  const [company, setCompany] = useState(initial?.company ?? "");
  const [phone, setPhone] = useState<PhoneValue>(parsePhoneE164(initial?.phone));
  const [mobile, setMobile] = useState<PhoneValue>(parsePhoneE164(initial?.mobile));
  const [jobTitle, setJobTitle] = useState(initial?.jobTitle ?? "");
  const [score, setScore] = useState<number>(initial?.score ?? 0);
  const [industry, setIndustry] = useState(initial?.industry ?? "");
  const [secondaryEmail, setSecondaryEmail] = useState(initial?.secondaryEmail ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(initial?.linkedinUrl ?? "");
  const [annualRevenueDisplay, setAnnualRevenueDisplay] = useState(initial?.annualRevenueDisplay ?? "");
  const [leadType, setLeadType] = useState(initial?.leadType ?? "");
  const [firstName, setFirstName] = useState(initial?.firstName ?? "");
  const [lastName, setLastName] = useState(initial?.lastName ?? "");
  const [contactLinkedinUrl, setContactLinkedinUrl] = useState(initial?.contactLinkedinUrl ?? "");
  const [requirementDetails, setRequirementDetails] = useState<RequirementDetails>(() => {
    const req = parseRequirementDetails(initial?.requirementDetails);
    if (!req.technology && initial?.technology) {
      req.technology = parseRequirementTechnology(initial.technology);
    }
    return req;
  });
  const [numberOfEmployees, setNumberOfEmployees] = useState(
    () => String(initial?.dynamicFields?.numberOfEmployees ?? ""),
  );
  const [rating, setRating] = useState(
    () => String(initial?.dynamicFields?.rating ?? ""),
  );
  const [source, setSource] = useState(initial?.source ?? "");
  const [status, setStatus] = useState(initial?.status ?? "Open");
  const [stage, setStage] = useState(initial?.stage ?? "New");
  const [substatus, setSubstatus] = useState(initial?.substatus ?? "");
  const [country, setCountry] = useState(initial?.country ?? "");
  const [addressLine1, setAddressLine1] = useState(initial?.addressLine1 ?? "");
  const [addressLine2, setAddressLine2] = useState(initial?.addressLine2 ?? "");
  const [cityName, setCityName] = useState(initial?.cityName ?? "");
  const [stateName, setStateName] = useState(initial?.stateName ?? "");
  const [postalCode, setPostalCode] = useState(initial?.postalCode ?? "");
  const [lat, setLat] = useState(
    initial?.lat != null && initial.lat !== "" ? String(initial.lat) : "",
  );
  const [long, setLong] = useState(
    initial?.long != null && initial.long !== "" ? String(initial.long) : "",
  );
  const [addressOpen, setAddressOpen] = useState(() =>
    Boolean(
      initial?.country ||
        initial?.addressLine1 ||
        initial?.addressLine2 ||
        initial?.cityName ||
        initial?.stateName ||
        initial?.postalCode ||
        initial?.lat ||
        initial?.long,
    ),
  );
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? defaultOwnerId ?? "");
  const [ownerNameRaw, setOwnerNameRaw] = useState(initial?.ownerName ?? defaultOwnerName ?? "");
  const ownerDefaultAppliedRef = useRef(false);
  // Linked account: searchable picker. accountId is the source of truth on
  // submit; accountQuery just drives the visible input + result fetch.
  const [accountId, setAccountId] = useState(initial?.accountId ?? "");
  const [accountQuery, setAccountQuery] = useState(initial?.accountName ?? "");
  const [accountHits, setAccountHits] = useState<AccountHit[]>([]);
  const [accountListOpen, setAccountListOpen] = useState(false);
  const debouncedAccountQuery = useDebouncedValue(accountQuery, 300);
  const [dynValues, setDynValues] = useState<Record<string, unknown>>(
    (initial?.dynamicFields as Record<string, unknown> | null | undefined) ?? {},
  );
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [wizardStep, setWizardStep] = useState(0);
  const wizardSubmitArmedRef = useRef(false);
  const draftRestoredRef = useRef(false);
  const isWizard = !initial?.id;

  const settingsReturnTo = useMemo(() => {
    if (draftScope) return returnToForDraftScope(draftScope);
    if (initial?.id) return `/leads/${initial.id}`;
    return null;
  }, [draftScope, initial?.id]);

  const collectDraft = useCallback((): LeadFormDraftValues => {
    return {
      name,
      email,
      company,
      phone,
      mobile,
      jobTitle,
      score,
      industry,
      secondaryEmail,
      website,
      linkedinUrl,
      annualRevenueDisplay,
      leadType,
      firstName,
      lastName,
      contactLinkedinUrl,
      requirementDetails,
      source,
      status,
      stage,
      substatus,
      country,
      addressLine1,
      addressLine2,
      cityName,
      stateName,
      postalCode,
      lat,
      long,
      addressOpen,
      ownerId,
      ownerNameRaw,
      accountId,
      accountQuery,
      dynValues,
    };
  }, [
    name,
    email,
    company,
    phone,
    mobile,
    jobTitle,
    score,
    industry,
    secondaryEmail,
    website,
    linkedinUrl,
    annualRevenueDisplay,
    leadType,
    firstName,
    lastName,
    contactLinkedinUrl,
    requirementDetails,
    source,
    status,
    stage,
    substatus,
    country,
    addressLine1,
    addressLine2,
    cityName,
    stateName,
    postalCode,
    lat,
    long,
    addressOpen,
    ownerId,
    ownerNameRaw,
    accountId,
    accountQuery,
    dynValues,
  ]);

  const setRequirementField = useCallback((key: string, value: unknown) => {
    setRequirementDetails((prev) => ({ ...prev, [key]: value }));
  }, []);

  useEffect(() => {
    if (!draftScope || initial?.id || draftRestoredRef.current) return;
    draftRestoredRef.current = true;
    if (!hasPendingSettingsReturn(draftScope)) {
      discardLeadFormDraft(draftScope);
      return;
    }
    clearPendingSettingsReturn();
    const draft = loadLeadFormDraft(draftScope);
    if (!draft) return;
    setName(draft.name);
    setEmail(draft.email);
    setCompany(draft.company);
    setPhone(draft.phone);
    setMobile(draft.mobile);
    setJobTitle(draft.jobTitle);
    setScore(draft.score);
    setIndustry(draft.industry);
    setSecondaryEmail(draft.secondaryEmail);
    setWebsite(draft.website);
    setLinkedinUrl(draft.linkedinUrl);
    setAnnualRevenueDisplay(draft.annualRevenueDisplay);
    setLeadType(draft.leadType ?? "");
    setFirstName(draft.firstName ?? "");
    setLastName(draft.lastName ?? "");
    setContactLinkedinUrl(draft.contactLinkedinUrl ?? "");
    setRequirementDetails(draft.requirementDetails ?? {});
    setSource(draft.source);
    setStatus(draft.status);
    setStage(draft.stage);
    setSubstatus(draft.substatus ?? "");
    setCountry(draft.country);
    setAddressLine1(draft.addressLine1);
    setAddressLine2(draft.addressLine2);
    setCityName(draft.cityName);
    setStateName(draft.stateName);
    setPostalCode(draft.postalCode);
    setLat(draft.lat);
    setLong(draft.long);
    setAddressOpen(draft.addressOpen);
    setOwnerId(draft.ownerId);
    setOwnerNameRaw(draft.ownerNameRaw);
    if (draft.accountId || !initial?.accountId) {
      setAccountId(draft.accountId);
      setAccountQuery(draft.accountQuery);
    }
    setDynValues(draft.dynValues ?? {});
  }, [draftScope, initial?.id, initial?.accountId]);

  useEffect(() => {
    if (initial?.id || ownerDefaultAppliedRef.current || !defaultOwnerId) return;
    if (owners.length > 0 && owners.some((o) => o.id === defaultOwnerId)) {
      setOwnerId(defaultOwnerId);
      ownerDefaultAppliedRef.current = true;
    }
  }, [defaultOwnerId, owners, initial?.id]);

  /** Refetch dropdown lookups — busts session cache first (Settings may have changed). */
  const reloadLookups = useCallback(() => {
    fetchCustomFieldDefs()
      .then((items) => setDefs(items))
      .finally(() => setDefsLoading(false));

    fetchOwners()
      .then((list) => setOwners(list))
      .finally(() => setOwnersLoading(false));

    invalidateSourcesCache();
    setSourcesLoading(true);
    fetchSources()
      .then((list) => {
        const resolved = list;
        setSources(resolved);
        if (!initial?.id) {
          // Do not auto-select the first source for new leads.
          // The dropdown shows "— Select source —" until the user chooses.
          setSource((cur) => {
            if (cur && resolved.some((s) => s.name === cur)) return cur;
            return "";
          });
        }
      })
      .finally(() => setSourcesLoading(false));

    invalidatePipelineConfigCache();
    fetchPipelineConfig()
      .then((cfg) => {
        const stages      = cfg?.stages?.length      ? cfg.stages      : DEFAULT_STAGES;
        const statuses    = cfg?.statuses?.length    ? cfg.statuses    : DEFAULT_STATUSES;
        const substatuses = Array.isArray(cfg?.substatuses) ? cfg.substatuses : [];
        setPipeline({
          stages,
          statuses,
          substatuses,
          dependentRules: cfg?.dependentRules ?? {},
        });
        if (!initial?.id) {
          setStage((cur) => (stages.includes(cur) ? cur : stages[0] ?? "New"));
          setStatus((cur) => (statuses.includes(cur) ? cur : statuses[0] ?? "Open"));
        }
      })
      .finally(() => setPipelineReady(true));

    fetch("/api/settings/lead-scoring", { credentials: "include" })
      .then((r) => r.json())
      .then((json) => {
        const cfg = json?.data?.config;
        if (!cfg) return;
        setAutoScoreLocked(
          Boolean(cfg.enabled && cfg.autoRecalculate && !cfg.allowManualOverride),
        );
      })
      .catch(() => setAutoScoreLocked(false));
  }, [initial?.id]);

  // Re-run when route changes (e.g. back from /settings/stages on lead detail).
  // Next.js router cache can restore the page without remounting this component.
  useEffect(() => {
    let cancel = false;
    setDefsLoading(true);
    setOwnersLoading(true);

    const run = () => {
      if (cancel) return;
      reloadLookups();
    };
    run();

    function onPageShow() {
      run();
    }
    window.addEventListener("pageshow", onPageShow);
    return () => {
      cancel = true;
      window.removeEventListener("pageshow", onPageShow);
    };
  }, [pathname, reloadLookups]);

  // Account picker: fetch matching accounts as the user types (debounced 300ms).
  // Also runs once on mount with empty query so the dropdown can preview accounts
  // before the user types anything.
  //
  // pageSize must be one of `lib/validators/pagination.ts::ALLOWED_PAGE_SIZES`
  // ([10, 25, 50, 100]). A previous version used `40` which silently 400'd
  // and left the dropdown empty (`.catch(() => {})` swallowed the error).
  // 50 is the smallest allowed size ≥ the original 40 — same UX feel,
  // server now accepts it. If we ever need a richer preview, the right
  // fix is a dedicated `/api/accounts/typeahead` endpoint, not widening
  // the shared allow-list.
  useEffect(() => {
    let cancel = false;
    const params = new URLSearchParams({ pageSize: "50" });
    const q = debouncedAccountQuery.trim();
    if (q) params.set("search", q);
    fetch(`/api/accounts?${params.toString()}`, { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (cancel || !j) return;
        const data = Array.isArray(j?.data) ? j.data : [];
        setAccountHits(
          data.map((a: { id: string; name: string; segment?: string }) => ({
            id: a.id,
            name: a.name,
            segment: a.segment ?? "",
          })),
        );
      })
      .catch(() => {});
    return () => {
      cancel = true;
    };
  }, [debouncedAccountQuery]);

  function pickAccount(hit: AccountHit) {
    setAccountId(hit.id);
    setAccountQuery(hit.name);
    setAccountListOpen(false);
  }

  function clearAccount() {
    setAccountId("");
    setAccountQuery("");
  }

  // Dependent rules: filter stages by selected source, filter statuses by selected stage.
  const visibleStages = useMemo(() => {
    const allowed = source ? pipeline.dependentRules.sourceToStages?.[source] : undefined;
    return allowed && allowed.length > 0 ? pipeline.stages.filter((s) => allowed.includes(s)) : pipeline.stages;
  }, [pipeline, source]);

  const visibleStatuses = useMemo(() => {
    const allowed = stage ? pipeline.dependentRules.stageToStatuses?.[stage] : undefined;
    return allowed && allowed.length > 0 ? pipeline.statuses.filter((s) => allowed.includes(s)) : pipeline.statuses;
  }, [pipeline, stage]);

  const visibleSubstatuses = useMemo(() => {
    const allowed = status ? pipeline.dependentRules.statusToSubstatuses?.[status] : undefined;
    return allowed && allowed.length > 0
      ? pipeline.substatuses.filter((s) => allowed.includes(s))
      : pipeline.substatuses;
  }, [pipeline, status]);

  // If the active stage falls outside the new visible set (after source change), pick the first allowed.
  useEffect(() => {
    if (visibleStages.length > 0 && !visibleStages.includes(stage)) {
      setStage(visibleStages[0]!);
    }
  }, [visibleStages, stage]);
  useEffect(() => {
    if (visibleStatuses.length > 0 && !visibleStatuses.includes(status)) {
      setStatus(visibleStatuses[0]!);
    }
  }, [visibleStatuses, status]);
  // Reset substatus when it falls outside the allowed set for the current status.
  useEffect(() => {
    if (substatus && visibleSubstatuses.length > 0 && !visibleSubstatuses.includes(substatus)) {
      setSubstatus("");
    }
  }, [visibleSubstatuses, substatus]);

  const additionalFieldDefs = useMemo(
    () =>
      defs.filter(
        (d) =>
          !["leadType"].includes(d.key),
      ),
    [defs],
  );

  // Inject "Other Information" as step 3 only when custom fields exist.
  // The wizard step count is dynamic: 3 steps (no custom fields) or 4 steps.
  const hasCustomFields = !defsLoading && additionalFieldDefs.length > 0;

  const activeSteps = useMemo(
    () =>
      hasCustomFields
        ? ([...LEAD_FORM_STEPS, { id: "other-info", label: "Other Information" }] as const)
        : LEAD_FORM_STEPS,
    [hasCustomFields],
  );

  // Dynamic last step index replaces the static lastStepIndex import.
  const lastStepIndex = activeSteps.length - 1;

  function setDyn(key: string, value: unknown) {
    setDynValues((prev) => ({ ...prev, [key]: value }));
  }

  const stepValidationInput = useMemo((): LeadFormStepValidationInput => {
    return {
      name,
      company,
      firstName,
      lastName,
      email,
      secondaryEmail,
      phone,
      mobile,
      source,
      stage,
      status,
      leadType,
      ownerId,
      ownerNameRaw,
      ownersCount: owners.length,
      lat,
      long,
      pipelineReady,
      pipelineStages: pipeline.stages,
      pipelineStatuses: pipeline.statuses,
      defs,
      dynValues,
    };
  }, [
    name,
    company,
    firstName,
    lastName,
    email,
    secondaryEmail,
    phone,
    mobile,
    source,
    stage,
    status,
    leadType,
    ownerId,
    ownerNameRaw,
    owners.length,
    lat,
    long,
    pipelineReady,
    pipeline,
    defs,
    dynValues,
  ]);

  function goToWizardStep(next: number) {
    wizardSubmitArmedRef.current = false;
    setWizardStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleWizardNext() {
    wizardSubmitArmedRef.current = false;
    const stepErrs = validateLeadFormStep(wizardStep, stepValidationInput);
    setErrors(stepErrs);
    if (Object.keys(stepErrs).length > 0) {
      toast.rich("Validation Error", "Please fix the highlighted fields before continuing.", "error");
      return;
    }
    setErrors({});
    goToWizardStep(Math.min(wizardStep + 1, lastStepIndex));
  }

  function handleWizardPrevious() {
    wizardSubmitArmedRef.current = false;
    setErrors({});
    goToWizardStep(Math.max(wizardStep - 1, 0));
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Lead name is required";
    if (!company.trim()) errs.company = "Company name is required";
    if (!firstName.trim()) errs.firstName = "First name is required";
    if (!lastName.trim()) errs.lastName = "Last name is required";
    if (!email.trim()) errs.email = "Email is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errs.email = "Invalid email format";
    if (secondaryEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(secondaryEmail.trim())) {
      errs.secondaryEmail = "Invalid email format";
    }
    if (mobile.number.length !== 10) errs.mobile = "Mobile must be exactly 10 digits";
    if (phone.number && phone.number.length !== 10) errs.phone = "Phone must be exactly 10 digits";
    if (lat.trim()) {
      const n = Number(lat);
      if (Number.isNaN(n) || n < -90 || n > 90) errs.lat = "Latitude must be between -90 and 90";
    }
    if (long.trim()) {
      const n = Number(long);
      if (Number.isNaN(n) || n < -180 || n > 180) errs.long = "Longitude must be between -180 and 180";
    }
    if (!source.trim()) errs.source = "Source is required";
    if (!stage) errs.stage = "Stage is required";
    if (pipelineReady && stage && !pipeline.stages.includes(stage)) {
      errs.stage = `Choose a valid stage (${pipeline.stages.join(", ")})`;
    }
    if (pipelineReady && status && !pipeline.statuses.includes(status)) {
      errs.status = `Choose a valid lead status (${pipeline.statuses.join(", ")})`;
    }
    const hasOwner = owners.length > 0 ? !!ownerId : !!ownerNameRaw.trim();
    if (!hasOwner) errs.ownerId = "Owner is required";

    // Required dynamic fields
    for (const def of defs) {
      if (def.requirement !== "Required") continue;
      const v = dynValues[def.key];
      const empty =
        v == null || v === "" || (Array.isArray(v) && v.length === 0) ||
        (def.fieldType === "Phone" && (v as PhoneValue | undefined)?.number?.length !== 10);
      if (empty) errs[def.key] = `${def.label} is required`;
    }
    return errs;
  }

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // Prevent accidental submits (Enter key / dropdown selection) in wizard mode.
    // Only the explicit "Create lead" button arms submission.
    if (isWizard && wizardStep === lastStepIndex && !wizardSubmitArmedRef.current) {
      return;
    }
    wizardSubmitArmedRef.current = false;
    if (!pipelineReady) {
      toast.error("Form is still loading — wait a moment and try again.");
      return;
    }
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.rich("Validation Error", "Please fix the highlighted fields.", "error");
      return;
    }

    setSaving(true);
    onSubmittingChange?.(true);

    const resolvedOwnerName =
      owners.length > 0
        ? (ownerId ? owners.find((o) => o.id === ownerId)?.name ?? null : null)
        : ownerNameRaw.trim() || null;
    const resolvedOwnerId = owners.length > 0 ? ownerId || null : null;

    // Strip empty dynamic fields; keep Phone only when its number is set.
    const cleanDyn: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(dynValues)) {
      if (v == null || v === "") continue;
      if (Array.isArray(v) && v.length === 0) continue;
      const def = defs.find((d) => d.key === k);
      if (def?.fieldType === "Phone") {
        const pv = v as PhoneValue;
        if (!pv.number) continue;
      }
      cleanDyn[k] = v;
    }
    const cleanedReq = cleanRequirementDetails(requirementDetails);
    const reqTechnology = parseRequirementTechnology(cleanedReq.technology);

    const data = {
      name: name.trim(),
      email: email.trim(),
      phone: phone.number ? phoneValueToE164(phone) : null,
      mobile: phoneValueToE164(mobile),
      company: company.trim() || null,
      jobTitle: jobTitle.trim() || null,
      source: source.trim(),
      stage,
      status,
      substatus: substatus || null,
      ...(autoScoreLocked ? {} : { score: Number(score) || 0 }),
      country: country.trim() || null,
      addressLine1: addressLine1.trim() || null,
      addressLine2: addressLine2.trim() || null,
      cityName: cityName.trim() || null,
      stateName: stateName.trim() || null,
      postalCode: postalCode.trim() || null,
      lat: lat.trim() ? Number(lat) : null,
      long: long.trim() ? Number(long) : null,
      industry: industry.trim() || null,
      secondaryEmail: secondaryEmail.trim() || null,
      website: website.trim() || null,
      linkedinUrl: linkedinUrl.trim() || null,
      annualRevenueDisplay: annualRevenueDisplay.trim() || null,
      leadType: leadType || null,
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      contactLinkedinUrl: contactLinkedinUrl.trim() || null,
      technology: reqTechnology.length > 0 ? reqTechnology : null,
      requirementDetails: Object.keys(cleanedReq).length > 0 ? cleanedReq : null,
      ownerId: resolvedOwnerId,
      ownerName: resolvedOwnerName,
      // accountId is the source of truth — accountQuery is just the input label.
      // If the user typed a name but never picked from the dropdown, accountId
      // stays empty and the lead is created unattached (which is valid).
      accountId: accountId || null,
      dynamicFields: (() => {
        const extra: Record<string, unknown> = {};
        if (numberOfEmployees.trim()) extra.numberOfEmployees = Number(numberOfEmployees);
        if (rating) extra.rating = rating;
        const merged = { ...cleanDyn, ...extra };
        return Object.keys(merged).length > 0 ? merged : undefined;
      })(),
    };

    const url = initial?.id ? `/api/leads/${initial.id}` : "/api/leads";
    const method = initial?.id ? "PATCH" : "POST";

    try {
      const res = await fetch(url, {
        method,
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (json.errors && typeof json.errors === "object") {
          // Surface server-side field errors inline
          const mapped = Object.fromEntries(
            Object.entries(json.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)]),
          ) as Record<string, string>;
          setErrors(mapped);
          // In the create wizard the errored field (e.g. a duplicate email on
          // step 2) is often on a step the user isn't looking at, so the inline
          // highlight is invisible and the failure feels silent. Jump to the
          // EARLIEST step that owns any errored field so the highlight is seen.
          // Field→step map mirrors validateLeadFormStep(); unknown keys (custom
          // fields) map to the dynamic "Other Information" step when present.
          if (isWizard) {
            const STEP_OF_FIELD: Record<string, number> = {
              name: 0, ownerId: 0, source: 0, stage: 0, status: 0,
              company: 1, lat: 1, long: 1,
              firstName: 2, lastName: 2, email: 2, secondaryEmail: 2, mobile: 2, phone: 2,
            };
            const customStep = hasCustomFields ? lastStepIndex : null;
            const steps = Object.keys(mapped).map((k) =>
              k in STEP_OF_FIELD ? STEP_OF_FIELD[k]! : (customStep ?? 0),
            );
            if (steps.length > 0) {
              const target = Math.min(...steps);
              if (target !== wizardStep) goToWizardStep(target);
            }
          }
        }
        throw new Error(json.error || "Failed to save");
      }
      if (initial?.id) {
        toast.success("Lead updated");
      } else {
        toast.rich(
          "Lead Created Successfully",
          "The lead has been added and is now available in your pipeline.",
        );
      }
      if (draftScope) discardLeadFormDraft(draftScope);
      if (onSaved) {
        onSaved({ id: json.id ?? initial?.id });
      } else {
        router.push(`/leads/${json.id ?? initial?.id}`);
        router.refresh();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
      onSubmittingChange?.(false);
    }
  }

  function handleCancel() {
    if (draftScope && !initial?.id) discardLeadFormDraft(draftScope);
    if (onCancel) onCancel();
    else router.back();
  }

  return (
    <form id={formId} onSubmit={onSubmit} className="space-y-5" noValidate>
      {isWizard ? (
        <LeadCreateStepper
          currentStep={wizardStep}
          steps={activeSteps}
          onStepClick={(index) => {
            if (index >= wizardStep) return;
            setErrors({});
            goToWizardStep(index);
          }}
        />
      ) : null}

      <LeadFormView
        step={isWizard ? wizardStep : undefined}
        errors={errors}
        settingsReturnTo={settingsReturnTo}
        draftScope={draftScope}
        isEdit={Boolean(initial?.id)}
        collectDraft={collectDraft}
        name={name}
        setName={setName}
        ownerId={ownerId}
        setOwnerId={setOwnerId}
        ownerNameRaw={ownerNameRaw}
        setOwnerNameRaw={setOwnerNameRaw}
        ownersLoading={ownersLoading}
        owners={owners}
        status={status}
        setStatus={setStatus}
        visibleStatuses={visibleStatuses}
        substatus={substatus}
        setSubstatus={setSubstatus}
        visibleSubstatuses={visibleSubstatuses}
        source={source}
        setSource={setSource}
        sourcesLoading={sourcesLoading}
        sources={sources}
        stage={stage}
        setStage={setStage}
        visibleStages={visibleStages}
        score={score}
        setScore={setScore}
        autoScoreLocked={autoScoreLocked}
        leadType={leadType}
        setLeadType={setLeadType}
        company={company}
        setCompany={setCompany}
        industry={industry}
        setIndustry={setIndustry}
        industryOptions={INDUSTRY_OPTIONS}
        annualRevenueDisplay={annualRevenueDisplay}
        setAnnualRevenueDisplay={setAnnualRevenueDisplay}
        website={website}
        setWebsite={setWebsite}
        linkedinUrl={linkedinUrl}
        setLinkedinUrl={setLinkedinUrl}
        numberOfEmployees={numberOfEmployees}
        setNumberOfEmployees={setNumberOfEmployees}
        rating={rating}
        setRating={setRating}
        addressOpen={addressOpen}
        setAddressOpen={setAddressOpen}
        addressValues={{
          country,
          addressLine1,
          addressLine2,
          cityName,
          stateName,
          postalCode,
          lat,
          long,
        }}
        onAddressChange={(key, value) => {
          const setters: Record<keyof LeadAddressValues, (v: string) => void> = {
            country: setCountry,
            addressLine1: setAddressLine1,
            addressLine2: setAddressLine2,
            cityName: setCityName,
            stateName: setStateName,
            postalCode: setPostalCode,
            lat: setLat,
            long: setLong,
          };
          setters[key](value);
        }}
        accountQuery={accountQuery}
        setAccountQuery={setAccountQuery}
        accountId={accountId}
        setAccountId={setAccountId}
        accountListOpen={accountListOpen}
        setAccountListOpen={setAccountListOpen}
        accountHits={accountHits}
        pickAccount={pickAccount}
        clearAccount={clearAccount}
        firstName={firstName}
        setFirstName={setFirstName}
        lastName={lastName}
        setLastName={setLastName}
        jobTitle={jobTitle}
        setJobTitle={setJobTitle}
        email={email}
        setEmail={setEmail}
        secondaryEmail={secondaryEmail}
        setSecondaryEmail={setSecondaryEmail}
        phone={phone}
        setPhone={setPhone}
        mobile={mobile}
        setMobile={setMobile}
        contactLinkedinUrl={contactLinkedinUrl}
        setContactLinkedinUrl={setContactLinkedinUrl}
        requirementDetails={requirementDetails}
        setRequirementField={setRequirementField}
        defsLoading={defsLoading}
        additionalFieldDefs={additionalFieldDefs}
        dynValues={dynValues}
        setDyn={setDyn}
      />

      {isWizard ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-crm-border pt-4">
          <Button type="button" variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
          <div className="flex flex-wrap gap-2">
            {wizardStep > 0 ? (
              <Button type="button" variant="secondary" onClick={handleWizardPrevious}>
                Previous
              </Button>
            ) : null}
            {wizardStep < lastStepIndex ? (
              <Button type="button" onClick={handleWizardNext}>
                Next
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={saving}
                onClick={() => {
                  wizardSubmitArmedRef.current = true;
                }}
              >
                {saving ? (
                  <span className="flex items-center gap-2">
                    <Loader2 size={15} className="animate-spin" aria-hidden />
                    Creating…
                  </span>
                ) : (
                  submitLabel ?? "Create lead"
                )}
              </Button>
            )}
          </div>
        </div>
      ) : null}

      {!hideFooter && !isWizard ? (
        <FormActions className="pt-2">
          <Button type="button" variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? (
              <span className="flex items-center gap-2">
                <Loader2 size={15} className="animate-spin" aria-hidden />
                Saving…
              </span>
            ) : (
              submitLabel ?? "Save"
            )}
          </Button>
        </FormActions>
      ) : null}
    </form>
  );
}
