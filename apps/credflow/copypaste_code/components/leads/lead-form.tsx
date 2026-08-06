"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { FormActions } from "@/components/ui/form";
import { useToast } from "@/hooks/use-toast";
import { useDebouncedValue } from "@/hooks/use-debounce";
import { DynamicFieldInput } from "@/components/leads/dynamic-field-input";
import {
  PhoneField,
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
import { LeadFormSettingsLink } from "@/components/leads/lead-form-settings-link";

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
    descriptionInformation: string;
    ownerId: string;
    ownerName: string;
    followupPriority: string;
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
}
interface SourceOption {
  id: string;
  name: string;
}
interface PipelineConfig {
  stages: string[];
  statuses: string[];
  dependentRules: {
    sourceToStages?: Record<string, string[]>;
    stageToStatuses?: Record<string, string[]>;
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
    stages: DEFAULT_STAGES,
    statuses: DEFAULT_STATUSES,
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
  const [descriptionInformation, setDescriptionInformation] = useState(
    initial?.descriptionInformation ??
      ((initial?.dynamicFields as Record<string, unknown> | null | undefined)?.descriptionInformation as
        | string
        | undefined) ??
      "",
  );
  const [secondaryEmail, setSecondaryEmail] = useState(initial?.secondaryEmail ?? "");
  const [website, setWebsite] = useState(initial?.website ?? "");
  const [linkedinUrl, setLinkedinUrl] = useState(initial?.linkedinUrl ?? "");
  const [annualRevenueDisplay, setAnnualRevenueDisplay] = useState(initial?.annualRevenueDisplay ?? "");
  const [source, setSource] = useState(initial?.source ?? "");
  const [status, setStatus] = useState(initial?.status ?? "Open");
  const [stage, setStage] = useState(initial?.stage ?? "New");
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
  const [ownerId, setOwnerId] = useState(initial?.ownerId ?? "");
  const [ownerNameRaw, setOwnerNameRaw] = useState(initial?.ownerName ?? "");
  const [followUp, setFollowUp] = useState(initial?.followupPriority ?? "");
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
  const draftRestoredRef = useRef(false);

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
      descriptionInformation,
      source,
      status,
      stage,
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
      followUp,
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
    descriptionInformation,
    source,
    status,
    stage,
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
    followUp,
    accountId,
    accountQuery,
    dynValues,
  ]);

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
    setDescriptionInformation(draft.descriptionInformation ?? "");
    setSource(draft.source);
    setStatus(draft.status);
    setStage(draft.stage);
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
    setFollowUp(draft.followUp);
    if (draft.accountId || !initial?.accountId) {
      setAccountId(draft.accountId);
      setAccountQuery(draft.accountQuery);
    }
    setDynValues(draft.dynValues);
  }, [draftScope, initial?.id, initial?.accountId]);

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
      .then((list) => setSources(list))
      .finally(() => setSourcesLoading(false));

    invalidatePipelineConfigCache();
    fetchPipelineConfig()
      .then((cfg) => {
        const stages = cfg?.stages?.length ? cfg.stages : DEFAULT_STAGES;
        const statuses = cfg?.statuses?.length ? cfg.statuses : DEFAULT_STATUSES;
        setPipeline({
          stages,
          statuses,
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

  function setDyn(key: string, value: unknown) {
    setDynValues((prev) => ({ ...prev, [key]: value }));
  }

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = "Lead name is required";
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
    if (!pipelineReady) {
      toast.error("Form is still loading — wait a moment and try again.");
      return;
    }
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      toast.error("Please fix the highlighted fields.");
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
      descriptionInformation: descriptionInformation.trim() || null,
      ownerId: resolvedOwnerId,
      ownerName: resolvedOwnerName,
      followupPriority: followUp || null,
      // accountId is the source of truth — accountQuery is just the input label.
      // If the user typed a name but never picked from the dropdown, accountId
      // stays empty and the lead is created unattached (which is valid).
      accountId: accountId || null,
      dynamicFields: Object.keys(cleanDyn).length > 0 ? cleanDyn : undefined,
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
          setErrors(
            Object.fromEntries(
              Object.entries(json.errors).map(([k, v]) => [k, Array.isArray(v) ? v[0] : String(v)]),
            ) as Record<string, string>,
          );
        }
        throw new Error(json.error || "Failed to save");
      }
      toast.success(initial?.id ? "Lead updated" : "Lead created");
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
      <Row>
        <Field label="Lead Name *" error={errors.name}>
          <Input value={name} onChange={(e) => setName(e.target.value)} required />
        </Field>
        <Field label="Company">
          <Input value={company} onChange={(e) => setCompany(e.target.value)} />
        </Field>
      </Row>

      <Row>
        <Field label="Email *" error={errors.email}>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </Field>
        <Field label="Secondary email" error={errors.secondaryEmail}>
          <Input
            type="email"
            value={secondaryEmail}
            onChange={(e) => setSecondaryEmail(e.target.value)}
            placeholder="alternate@company.com"
          />
        </Field>
      </Row>

      <Row>
        <Field label="Phone" error={errors.phone}>
          <PhoneField value={phone} onChange={setPhone} invalid={!!errors.phone} ariaLabel="Phone" />
        </Field>
        <Field label="Mobile *" error={errors.mobile}>
          <PhoneField value={mobile} onChange={setMobile} required invalid={!!errors.mobile} ariaLabel="Mobile" />
        </Field>
      </Row>

      <Row>
        <Field label="Title">
          <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} />
        </Field>
        <Field label="Industry">
          <Select value={industry} onChange={(e) => setIndustry(e.target.value)}>
            <option value="">— Select industry —</option>
            {INDUSTRY_OPTIONS.map((item) => (
              <option key={item} value={item}>
                {item}
              </option>
            ))}
          </Select>
        </Field>
      </Row>

      <Row>
        <Field label="Annual revenue">
          <Input
            value={annualRevenueDisplay}
            onChange={(e) => setAnnualRevenueDisplay(e.target.value)}
            placeholder="e.g. ₹5 Cr, $2M"
          />
        </Field>
        <Field label="Description Information">
          <Input
            value={descriptionInformation}
            onChange={(e) => setDescriptionInformation(e.target.value)}
            placeholder="Add short description"
          />
        </Field>
      </Row>

      <Row>
        <Field
          label="Lead score"
          help={
            autoScoreLocked
              ? "Calculated automatically from fit, engagement, and scoring rules."
              : undefined
          }
        >
          <Input
            type="number"
            min={0}
            max={100}
            value={score}
            readOnly={autoScoreLocked}
            disabled={autoScoreLocked}
            onChange={(e) => setScore(Number(e.target.value))}
            className={autoScoreLocked ? "bg-crm-panel text-crm-muted" : undefined}
          />
        </Field>
        <div className="hidden md:block" aria-hidden />
      </Row>

      <Row>
        <Field label="LinkedIn URL" error={errors.linkedinUrl}>
          <Input
            value={linkedinUrl}
            onChange={(e) => setLinkedinUrl(e.target.value)}
            placeholder="https://linkedin.com/in/…"
          />
        </Field>
        <Field label="Website" error={errors.website}>
          <Input
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
            placeholder="https://company.com"
          />
        </Field>
      </Row>

      {defsLoading ? (
        <fieldset className="rounded-lg border border-crm-border p-4" aria-busy="true">
          <legend className="px-1 text-sm font-medium text-crm-text">Additional Fields</legend>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div className="h-9 animate-pulse rounded bg-crm-panel" />
            <div className="h-9 animate-pulse rounded bg-crm-panel" />
          </div>
        </fieldset>
      ) : defs.length > 0 ? (
        <fieldset className="rounded-lg border border-crm-border p-4">
          <legend className="px-1 text-sm font-medium text-crm-text">Additional Fields</legend>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {defs.map((def) => (
              <Field
                key={def.key}
                label={`${def.label}${def.requirement === "Required" ? " *" : ""}`}
                help={def.helpText ?? undefined}
                error={errors[def.key]}
              >
                <DynamicFieldInput def={def} value={dynValues[def.key]} onChange={(v) => setDyn(def.key, v)} />
              </Field>
            ))}
          </div>
        </fieldset>
      ) : null}

      <Row>
        <Field
          label="Source *"
          error={errors.source}
          action={
            <LeadFormSettingsLink
              settingsPath="/settings/sources"
              returnTo={settingsReturnTo}
              draftScope={draftScope && !initial?.id ? draftScope : undefined}
              getDraft={collectDraft}
            >
              + Lead sources
            </LeadFormSettingsLink>
          }
        >
          {sourcesLoading ? (
            <Select value="" disabled>
              <option value="">Loading sources…</option>
            </Select>
          ) : sources.length > 0 ? (
            <Select value={source} onChange={(e) => setSource(e.target.value)} required>
              <option value="">— Select source —</option>
              {sources.map((s) => (
                <option key={s.id} value={s.name}>
                  {s.name}
                </option>
              ))}
            </Select>
          ) : (
            <Input value={source} onChange={(e) => setSource(e.target.value)} required placeholder="Web, Referral, Ads…" />
          )}
        </Field>
        <Field
          label="Stage *"
          error={errors.stage}
          action={
            <LeadFormSettingsLink
              settingsPath="/settings/stages?focus=add-stage"
              returnTo={settingsReturnTo}
              draftScope={draftScope && !initial?.id ? draftScope : undefined}
              getDraft={collectDraft}
            >
              + Add Stage
            </LeadFormSettingsLink>
          }
        >
          <Select value={stage} onChange={(e) => setStage(e.target.value)} required>
            {visibleStages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
      </Row>

      <Row>
        <Field
          label="Lead status"
          error={errors.status}
          action={
            <LeadFormSettingsLink
              settingsPath={`/settings/stages?focus=statuses${stage ? `&stage=${encodeURIComponent(stage)}` : ""}`}
              returnTo={settingsReturnTo}
              draftScope={draftScope && !initial?.id ? draftScope : undefined}
              getDraft={collectDraft}
            >
              + Add Status
            </LeadFormSettingsLink>
          }
        >
          <Select value={status} onChange={(e) => setStatus(e.target.value)}>
            {visibleStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Follow-up priority">
          <Select value={followUp} onChange={(e) => setFollowUp(e.target.value)}>
            <option value="">—</option>
            {PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </Select>
        </Field>
      </Row>

      <Row>
        <Field label="Owner *" error={errors.ownerId}>
          {ownersLoading ? (
            <Select value="" disabled>
              <option value="">Loading owners…</option>
            </Select>
          ) : owners.length > 0 ? (
            <Select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} required>
              <option value="">— Select owner —</option>
              {owners.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </Select>
          ) : (
            <Input
              value={ownerNameRaw}
              onChange={(e) => setOwnerNameRaw(e.target.value)}
              placeholder="Owner name"
            />
          )}
        </Field>

        <Field label="Link account">
          <div className="relative">
            <Input
              value={accountQuery}
              placeholder="Search accounts by name…"
              onChange={(e) => {
                setAccountQuery(e.target.value);
                // Typing clears the previous selection — they must re-pick from the list.
                if (accountId) setAccountId("");
                setAccountListOpen(true);
              }}
              onFocus={() => setAccountListOpen(true)}
              // Defer close so a click on the list item registers before the blur fires.
              onBlur={() => setTimeout(() => setAccountListOpen(false), 150)}
            />
            {accountId && (
              <button
                type="button"
                onClick={clearAccount}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-crm-muted hover:text-crm-text"
                aria-label="Clear linked account"
              >
                Clear
              </button>
            )}
            {accountListOpen && accountHits.length > 0 && (
              <ul className="absolute left-0 right-0 z-30 mt-1 max-h-56 overflow-y-auto rounded border border-crm-border bg-white text-sm shadow-crm-dropdown">
                {accountHits.map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        // onMouseDown so the input's onBlur doesn't dismiss the list before the click lands.
                        e.preventDefault();
                        pickAccount(a);
                      }}
                      className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left hover:bg-crm-panel"
                    >
                      <span className="truncate text-crm-text">{a.name}</span>
                      {a.segment && (
                        <span className="shrink-0 text-xs text-crm-muted">{a.segment}</span>
                      )}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          {accountId && (
            <span className="mt-1 block text-[11px] text-crm-muted">
              Linked to account id <span className="font-mono">{accountId}</span>
            </span>
          )}
        </Field>
      </Row>

      <Row>
        <LeadAddressSection
          open={addressOpen}
          onOpenChange={setAddressOpen}
          values={{
            country,
            addressLine1,
            addressLine2,
            cityName,
            stateName,
            postalCode,
            lat,
            long,
          }}
          onChange={(key, value) => {
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
          errors={{
            lat: errors.lat,
            long: errors.long,
          }}
        />
        <div className="hidden md:block" aria-hidden />
      </Row>

      {!hideFooter && (
        <FormActions className="pt-2">
          <Button type="button" variant="secondary" onClick={handleCancel}>
            Cancel
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? "Saving…" : submitLabel ?? (initial?.id ? "Save" : "Create lead")}
          </Button>
        </FormActions>
      )}
    </form>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 gap-4 md:grid-cols-2">{children}</div>;
}

function Field({
  label,
  help,
  action,
  error,
  children,
}: {
  label: string;
  help?: string;
  action?: React.ReactNode;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 flex items-center justify-between text-sm font-medium text-crm-text">
        <span>{label}</span>
        {action}
      </span>
      {children}
      {error && <span className="mt-1 block text-[11px] text-red-600">{error}</span>}
      {!error && help && <span className="mt-1 block text-[11px] text-crm-muted">{help}</span>}
    </label>
  );
}
