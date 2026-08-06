"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  cloneElement,
  isValidElement,
  type ReactNode,
} from "react";
import {
  ClipboardList,
  FileText,
  Layers,
  List,
  PhoneCall,
  Sparkles,
  Target,
  User,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/activities/log-activity/searchable-select";
import {
  ACTIVITY_TYPE_META,
  NOTE_TEMPLATES,
  VISIBILITY_OPTIONS,
  formatVisibilityPrefix,
  sourceBadgeClass,
  type ActivityVisibility,
} from "@/lib/activities/activity-type-meta";
import type { SmbDispositionMeta } from "@/lib/services/activities/smb-outreach-meta";
import {
  GENERIC_ACTIVITY_TYPES,
  type GenericActivityType,
} from "@/lib/services/activities/generic-activity-types";

export type LeadContext = {
  id: string;
  label: string;
  source?: string | null;
  stage?: string | null;
  ownerName?: string | null;
};

type RelatedOption = { id: string; label: string };
type LeadLogMeta = { activityCodes: string[]; outcomes: string[] };
type SmbMeta = {
  countries: string[];
  priorities: string[];
  channels: string[];
  competitors: string[];
  dispositions: SmbDispositionMeta[];
};

const KIND_OPTIONS = ["Lead", "Opportunity", "Contact", "Account"] as const;
const DRAFT_STORAGE_KEY = "quikcrm.activity-composer.draft.v1";

type TabId = "generic" | "lead-log" | "smb";

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  canViewLeads: boolean;
  initialLead?: LeadContext | null;
  initialRelated?: { kind: (typeof KIND_OPTIONS)[number]; id: string; label: string } | null;
  /** When set, Generic tab opens with this type (e.g. Meeting from command palette). */
  initialGenericType?: GenericActivityType | null;
}

let cachedLeadLogMeta: LeadLogMeta | null = null;
let cachedSmbMeta: SmbMeta | null = null;

async function fetchLeadLogMeta(): Promise<LeadLogMeta> {
  if (cachedLeadLogMeta) return cachedLeadLogMeta;
  const res = await fetch("/api/activities/meta/lead-log");
  const body = await res.json();
  cachedLeadLogMeta = body?.data ?? { activityCodes: [], outcomes: [] };
  return cachedLeadLogMeta!;
}

async function fetchSmbMeta(): Promise<SmbMeta> {
  if (cachedSmbMeta) return cachedSmbMeta;
  const res = await fetch("/api/activities/smb-outreach/meta");
  const body = await res.json();
  cachedSmbMeta = body?.data ?? {
    countries: [],
    priorities: [],
    channels: [],
    competitors: [],
    dispositions: [],
  };
  return cachedSmbMeta!;
}

function buildDetailNotes(
  body: string,
  meta: Record<string, string | undefined>,
  visibility: ActivityVisibility,
): string {
  const lines: string[] = [];
  if (visibility !== "team") lines.push(formatVisibilityPrefix(visibility));
  for (const [label, value] of Object.entries(meta)) {
    if (value?.trim()) lines.push(`${label}: ${value.trim()}`);
  }
  if (body.trim()) lines.push(body.trim());
  return lines.join("\n");
}

export function LogActivityModal({
  open,
  onClose,
  onSuccess,
  canViewLeads,
  initialLead = null,
  initialRelated = null,
  initialGenericType = null,
}: Props) {
  const toast = useToast();
  const [tab, setTab] = useState<TabId>("generic");
  const [submitting, setSubmitting] = useState(false);
  const [reminderOn, setReminderOn] = useState(false);
  const [visibility, setVisibility] = useState<ActivityVisibility>("team");

  const [lead, setLead] = useState<LeadContext | null>(initialLead);
  const [leadOptions, setLeadOptions] = useState<RelatedOption[]>([]);
  const [leadOptionsLoaded, setLeadOptionsLoaded] = useState(false);

  const [type, setType] = useState<GenericActivityType>("Note");
  const [relatedKind, setRelatedKind] =
    useState<(typeof KIND_OPTIONS)[number]>("Lead");
  const [relatedObjectId, setRelatedObjectId] = useState("");
  const [subject, setSubject] = useState("");
  const [outcome, setOutcome] = useState("");
  const [genericNotes, setGenericNotes] = useState("");
  const [durationMin, setDurationMin] = useState("");
  const [meetingAt, setMeetingAt] = useState("");
  const [attendees, setAttendees] = useState("");
  const [emailRecipient, setEmailRecipient] = useState("");
  const [emailStatus, setEmailStatus] = useState("");
  const [nextAction, setNextAction] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");

  const [relatedOptions, setRelatedOptions] = useState<
    Record<(typeof KIND_OPTIONS)[number], RelatedOption[] | undefined>
  >({ Lead: undefined, Opportunity: undefined, Contact: undefined, Account: undefined });
  const [relatedLoading, setRelatedLoading] = useState(false);

  const [leadLogMeta, setLeadLogMeta] = useState<LeadLogMeta | null>(null);
  const [activityCode, setActivityCode] = useState("");
  const [logOutcome, setLogOutcome] = useState("");
  const [llDetailNotes, setLlDetailNotes] = useState("");
  const [llFollowUpAt, setLlFollowUpAt] = useState("");

  const [smbMeta, setSmbMeta] = useState<SmbMeta | null>(null);
  const [country, setCountry] = useState("");
  const [followupPriority, setFollowupPriority] = useState("");
  const [channel, setChannel] = useState("");
  const [competitor, setCompetitor] = useState("");
  const [disposition, setDisposition] = useState("");
  const [subDisposition, setSubDisposition] = useState("");
  const [subSubDisposition, setSubSubDisposition] = useState("");
  const [smbDetailNotes, setSmbDetailNotes] = useState("");

  const showLeadTabs = canViewLeads;
  const typeMeta = ACTIVITY_TYPE_META[type];
  const TypeIcon = typeMeta.icon;

  const contextRecordLabel = useMemo(() => {
    if (tab === "generic") {
      const opt = relatedOptions[relatedKind]?.find((o) => o.id === relatedObjectId);
      return opt?.label ?? (relatedKind === "Lead" && lead?.label) ?? null;
    }
    return lead?.label ?? null;
  }, [tab, relatedKind, relatedObjectId, relatedOptions, lead]);

  function selectTab(next: TabId) {
    setTab(next);
    if (next === "generic" || relatedKind !== "Lead" || !relatedObjectId) return;
    const fromCache = relatedOptions.Lead?.find((o) => o.id === relatedObjectId);
    if (fromCache) {
      setLead({ id: fromCache.id, label: fromCache.label, ...lead });
      return;
    }
    const fromPicker = leadOptions.find((l) => l.id === relatedObjectId);
    if (fromPicker) setLead({ id: fromPicker.id, label: fromPicker.label, ...lead });
    else if (initialLead?.id === relatedObjectId) setLead(initialLead);
  }

  const resetForm = useCallback(() => {
    setTab("generic");
    setLead(initialLead);
    setSubmitting(false);
    setReminderOn(false);
    setVisibility("team");
    setType(initialGenericType ?? "Note");
    setSubject("");
    setOutcome("");
    setGenericNotes("");
    setDurationMin("");
    setMeetingAt("");
    setAttendees("");
    setEmailRecipient("");
    setEmailStatus("");
    setNextAction("");
    setFollowUpAt("");
    setActivityCode("");
    setLogOutcome("");
    setLlDetailNotes("");
    setLlFollowUpAt("");
    setCountry("");
    setFollowupPriority("");
    setChannel("");
    setCompetitor("");
    setDisposition("");
    setSubDisposition("");
    setSubSubDisposition("");
    setSmbDetailNotes("");
    if (initialRelated) {
      setRelatedKind(initialRelated.kind);
      setRelatedObjectId(initialRelated.id);
      setRelatedOptions((prev) => ({
        ...prev,
        [initialRelated.kind]: [{ id: initialRelated.id, label: initialRelated.label }],
      }));
    } else {
      setRelatedKind("Lead");
      setRelatedObjectId(initialLead?.id ?? "");
      if (initialLead) {
        setRelatedOptions((prev) => ({
          ...prev,
          Lead: [{ id: initialLead.id, label: initialLead.label }],
        }));
      }
    }
  }, [initialLead, initialRelated, initialGenericType]);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

  useEffect(() => {
    if (!open) return;
    if (tab === "lead-log" && !leadLogMeta) void fetchLeadLogMeta().then(setLeadLogMeta);
    if (tab === "smb" && !smbMeta) void fetchSmbMeta().then(setSmbMeta);
  }, [open, tab, leadLogMeta, smbMeta]);

  useEffect(() => {
    if (!open) return;
    if (leadOptionsLoaded) return;
    if (!showLeadTabs) return;
    void fetch("/api/leads/picker?limit=200")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => {
        const items: { id: string; name: string; company?: string | null }[] =
          body?.data?.items ?? body?.items ?? [];
        setLeadOptions(
          items.map((l) => ({
            id: l.id,
            label: l.company ? `${l.name} — ${l.company}` : l.name,
          })),
        );
        setLeadOptionsLoaded(true);
      })
      .catch(() => setLeadOptionsLoaded(true));
  }, [open, leadOptionsLoaded, showLeadTabs]);

  const fetchRelatedOptions = useCallback(
    async (kind: (typeof KIND_OPTIONS)[number]): Promise<RelatedOption[]> => {
      const path =
        kind === "Lead"
          ? "/api/leads/picker?limit=200"
          : kind === "Opportunity"
            ? "/api/opportunities/picker?limit=200"
            : kind === "Contact"
              ? "/api/contacts/picker?limit=200"
              : "/api/accounts/picker?limit=200";
      const res = await fetch(path);
      if (!res.ok) return [];
      const body = await res.json();
      const items: { id: string; name?: string; company?: string | null }[] =
        body?.data?.items ?? body?.items ?? [];
      return items.map((it) => ({
        id: it.id,
        label: it.company ? `${it.name ?? "—"} — ${it.company}` : it.name ?? "—",
      }));
    },
    [],
  );

  useEffect(() => {
    if (!open || tab !== "generic") return;
    if (relatedOptions[relatedKind] !== undefined) return;
    setRelatedLoading(true);
    fetchRelatedOptions(relatedKind)
      .then((items) => setRelatedOptions((prev) => ({ ...prev, [relatedKind]: items })))
      .catch(() => setRelatedOptions((prev) => ({ ...prev, [relatedKind]: [] })))
      .finally(() => setRelatedLoading(false));
  }, [open, tab, relatedKind, relatedOptions, fetchRelatedOptions]);

  const subOptions = useMemo<SmbDispositionMeta["sub"]>(() => {
    if (!smbMeta) return [];
    return smbMeta.dispositions.find((d) => d.value === disposition)?.sub ?? [];
  }, [smbMeta, disposition]);

  const subSubOptions = useMemo<string[]>(() => {
    return subOptions.find((s) => s.value === subDisposition)?.subSub ?? [];
  }, [subOptions, subDisposition]);

  const genericMeta = useMemo(() => {
    const m: Record<string, string | undefined> = {};
    if (type === "Call") {
      if (durationMin) m["Duration"] = `${durationMin} min`;
      if (outcome) m["Call outcome"] = outcome;
    }
    if (type === "Meeting") {
      if (meetingAt) m["Meeting"] = meetingAt;
      if (attendees) m["Attendees"] = attendees;
      if (nextAction) m["Next action"] = nextAction;
    }
    if (type === "Email") {
      if (emailRecipient) m["Recipient"] = emailRecipient;
      if (emailStatus) m["Status"] = emailStatus;
    }
    return m;
  }, [type, durationMin, outcome, meetingAt, attendees, nextAction, emailRecipient, emailStatus]);

  function saveDraft() {
    try {
      const payload = {
        tab,
        type,
        relatedKind,
        relatedObjectId,
        subject,
        outcome,
        genericNotes,
        visibility,
        savedAt: new Date().toISOString(),
      };
      localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(payload));
      toast.success("Draft saved on this device");
    } catch {
      toast.error("Could not save draft");
    }
  }

  function loadDraft() {
    try {
      const raw = localStorage.getItem(DRAFT_STORAGE_KEY);
      if (!raw) {
        toast.error("No draft found");
        return;
      }
      const d = JSON.parse(raw) as {
        tab?: TabId;
        type?: GenericActivityType;
        relatedKind?: (typeof KIND_OPTIONS)[number];
        relatedObjectId?: string;
        subject?: string;
        outcome?: string;
        genericNotes?: string;
        visibility?: ActivityVisibility;
      };
      if (d.tab) setTab(d.tab);
      if (d.type) setType(d.type);
      if (d.relatedKind) setRelatedKind(d.relatedKind);
      if (d.relatedObjectId) setRelatedObjectId(d.relatedObjectId);
      if (d.subject) setSubject(d.subject);
      if (d.outcome) setOutcome(d.outcome);
      if (d.genericNotes) setGenericNotes(d.genericNotes);
      if (d.visibility) setVisibility(d.visibility);
      toast.success("Draft restored");
    } catch {
      toast.error("Could not load draft");
    }
  }

  async function submitGeneric() {
    setSubmitting(true);
    try {
      const notes = buildDetailNotes(genericNotes, genericMeta, visibility);
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type,
          relatedKind,
          relatedObjectId,
          subject: subject || undefined,
          outcome:
            type === "Call" || type === "Email"
              ? outcome || emailStatus || undefined
              : outcome || undefined,
          detailNotes: notes || undefined,
          followUpAt:
            reminderOn && followUpAt ? new Date(followUpAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Failed to log activity");
        return;
      }
      localStorage.removeItem(DRAFT_STORAGE_KEY);
      toast.success("Activity logged");
      onSuccess();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  async function submitLeadLog() {
    if (!lead) {
      toast.error("Select a lead first");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/activities/lead-log", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          activityCode,
          logOutcome,
          detailNotes: buildDetailNotes(llDetailNotes, {}, visibility) || undefined,
          followUpAt: llFollowUpAt ? new Date(llFollowUpAt).toISOString() : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Failed to log call");
        return;
      }
      toast.success("Call logged");
      onSuccess();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSmb() {
    if (!lead) {
      toast.error("Select a lead first");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/activities/smb-outreach", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          country,
          followupPriority,
          channel,
          competitor,
          disposition,
          subDisposition,
          subSubDisposition,
          detailNotes: buildDetailNotes(smbDetailNotes, {}, visibility),
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        toast.error(body?.error ?? "Failed to log outreach");
        return;
      }
      toast.success("Outreach logged");
      onSuccess();
      onClose();
    } finally {
      setSubmitting(false);
    }
  }

  const submit =
    tab === "generic" ? submitGeneric : tab === "lead-log" ? submitLeadLog : submitSmb;

  const submitDisabled =
    tab === "generic"
      ? submitting || !type || !relatedKind || !relatedObjectId
      : tab === "lead-log"
        ? submitting || !lead || !activityCode || !logOutcome
        : submitting ||
          !lead ||
          !country ||
          !followupPriority ||
          !channel ||
          !competitor ||
          !disposition ||
          !subDisposition ||
          !subSubDisposition ||
          !smbDetailNotes;

  const footer = (
    <div className="flex flex-wrap items-center justify-between gap-2">
      <button
        type="button"
        className="text-xs font-medium text-crm-muted hover:text-accent-700"
        onClick={() => toast.info("AI activity summary — coming soon")}
      >
        <Sparkles size={12} className="mr-1 inline" />
        Generate summary
      </button>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" type="button" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="secondary" type="button" onClick={saveDraft}>
          Save draft
        </Button>
        <Button type="button" onClick={submit} disabled={submitDisabled}>
          Log activity
        </Button>
      </div>
    </div>
  );

  return (
    <Modal open={open} onClose={onClose} width="max-w-xl" footer={footer}>
      <div className="-mx-1 -mt-1 space-y-4">
        <header className="flex items-start justify-between gap-3 border-b border-crm-border pb-3">
          <div className="flex min-w-0 items-start gap-3">
            <span
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-2 ${typeMeta.ring} bg-white`}
            >
              <TypeIcon size={18} className={typeMeta.accent} />
            </span>
            <div className="min-w-0">
              <h2 className="text-base font-semibold text-crm-text">Log activity</h2>
              {contextRecordLabel ? (
                <p className="mt-0.5 truncate text-sm text-crm-muted">
                  <span className="font-medium text-crm-text">{relatedKind}:</span>{" "}
                  {contextRecordLabel}
                </p>
              ) : (
                <p className="mt-0.5 text-xs text-crm-muted">
                  Link to a record — appears on its timeline
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {lead?.source ? (
                  <span
                    className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ring-1 ${sourceBadgeClass(lead.source)}`}
                  >
                    {lead.source}
                  </span>
                ) : null}
                {lead?.stage ? (
                  <span className="inline-flex rounded-full bg-crm-panel px-2 py-0.5 text-[10px] font-medium text-crm-muted ring-1 ring-crm-border">
                    {lead.stage}
                  </span>
                ) : null}
                {lead?.ownerName ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-crm-panel px-2 py-0.5 text-[10px] text-crm-muted ring-1 ring-crm-border">
                    <User size={10} />
                    {lead.ownerName}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="crm-btn-ghost h-8 w-8 shrink-0 p-0"
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>

        <SegmentedTabs
          tab={tab}
          showLeadTabs={showLeadTabs}
          onSelect={selectTab}
        />

        {tab === "generic" && (
          <div className="space-y-4">
            <Section title="Activity" description="Type-specific fields appear below.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Type">
                  <Select
                    value={type}
                    onChange={(e) => setType(e.target.value as GenericActivityType)}
                  >
                    {GENERIC_ACTIVITY_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Link to">
                  <Select
                    value={relatedKind}
                    onChange={(e) => {
                      setRelatedKind(e.target.value as (typeof KIND_OPTIONS)[number]);
                      setRelatedObjectId("");
                    }}
                  >
                    {KIND_OPTIONS.map((k) => (
                      <option key={k} value={k}>
                        {k}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <SearchableSelect
                    label={relatedKind}
                    placeholder={`Search ${relatedKind.toLowerCase()}…`}
                    value={relatedObjectId}
                    loading={relatedLoading && relatedOptions[relatedKind] === undefined}
                    options={relatedOptions[relatedKind] ?? []}
                    onChange={(id, opt) => {
                      setRelatedObjectId(id);
                      if (relatedKind === "Lead" && opt) {
                        setLead((prev) => ({
                          id: opt.id,
                          label: opt.label,
                          source: prev?.source,
                          stage: prev?.stage,
                          ownerName: prev?.ownerName,
                        }));
                      }
                    }}
                  />
                </div>
              </div>
            </Section>

            <DynamicGenericFields
              type={type}
              subject={subject}
              setSubject={setSubject}
              outcome={outcome}
              setOutcome={setOutcome}
              durationMin={durationMin}
              setDurationMin={setDurationMin}
              followUpAt={followUpAt}
              setFollowUpAt={setFollowUpAt}
              meetingAt={meetingAt}
              setMeetingAt={setMeetingAt}
              attendees={attendees}
              setAttendees={setAttendees}
              nextAction={nextAction}
              setNextAction={setNextAction}
              emailRecipient={emailRecipient}
              setEmailRecipient={setEmailRecipient}
              emailStatus={emailStatus}
              setEmailStatus={setEmailStatus}
            />

            <NotesEditor
              label="Notes"
              value={genericNotes}
              onChange={setGenericNotes}
              onTemplate={(text) =>
                setGenericNotes((n) => (n.trim() ? `${n.trim()}\n\n${text}` : text))
              }
            />

            <OptionsRow
              reminderOn={reminderOn}
              setReminderOn={setReminderOn}
              followUpAt={followUpAt}
              setFollowUpAt={setFollowUpAt}
              visibility={visibility}
              setVisibility={setVisibility}
              onLoadDraft={loadDraft}
            />
          </div>
        )}

        {tab === "lead-log" && (
          <div className="space-y-4">
            <Section title="Call log" description="Structured disposition for sales calls.">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <SearchableSelect
                    label="Lead"
                    placeholder="Search leads…"
                    value={lead?.id ?? ""}
                    loading={!leadOptionsLoaded}
                    options={[
                      ...(lead && !leadOptions.some((l) => l.id === lead.id)
                        ? [{ id: lead.id, label: lead.label }]
                        : []),
                      ...leadOptions,
                    ]}
                    onChange={(id, opt) =>
                      setLead(opt ? { id: opt.id, label: opt.label, ...lead } : null)
                    }
                  />
                </div>
                <Field label="Activity code">
                  <Select value={activityCode} onChange={(e) => setActivityCode(e.target.value)}>
                    <option value="">—</option>
                    {leadLogMeta?.activityCodes.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Outcome">
                  <Select value={logOutcome} onChange={(e) => setLogOutcome(e.target.value)}>
                    <option value="">—</option>
                    {leadLogMeta?.outcomes.map((o) => (
                      <option key={o} value={o}>
                        {o}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Follow up">
                  <Input
                    type="datetime-local"
                    value={llFollowUpAt}
                    onChange={(e) => setLlFollowUpAt(e.target.value)}
                  />
                </Field>
              </div>
            </Section>
            <NotesEditor label="Detail notes" value={llDetailNotes} onChange={setLlDetailNotes} />
            <OptionsRow
              reminderOn={false}
              setReminderOn={() => {}}
              followUpAt=""
              setFollowUpAt={() => {}}
              visibility={visibility}
              setVisibility={setVisibility}
              hideReminder
            />
          </div>
        )}

        {tab === "smb" && (
          <div className="space-y-4">
            <Section title="SMB outreach" description="Disposition hierarchy for outbound SMB.">
              <div className="sm:col-span-2">
                <SearchableSelect
                  label="Lead"
                  placeholder="Search leads…"
                  value={lead?.id ?? ""}
                  loading={!leadOptionsLoaded}
                  options={[
                    ...(lead && !leadOptions.some((l) => l.id === lead.id)
                      ? [{ id: lead.id, label: lead.label }]
                      : []),
                    ...leadOptions,
                  ]}
                  onChange={(id, opt) =>
                    setLead(opt ? { id: opt.id, label: opt.label, ...lead } : null)
                  }
                />
              </div>
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Field label="Country">
                  <Select value={country} onChange={(e) => setCountry(e.target.value)}>
                    <option value="">—</option>
                    {smbMeta?.countries.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Priority">
                  <Select
                    value={followupPriority}
                    onChange={(e) => setFollowupPriority(e.target.value)}
                  >
                    <option value="">—</option>
                    {smbMeta?.priorities.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Channel">
                  <Select value={channel} onChange={(e) => setChannel(e.target.value)}>
                    <option value="">—</option>
                    {smbMeta?.channels.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Competitor">
                  <Select value={competitor} onChange={(e) => setCompetitor(e.target.value)}>
                    <option value="">—</option>
                    {smbMeta?.competitors.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Disposition">
                  <Select
                    value={disposition}
                    onChange={(e) => {
                      setDisposition(e.target.value);
                      setSubDisposition("");
                      setSubSubDisposition("");
                    }}
                  >
                    <option value="">—</option>
                    {smbMeta?.dispositions.map((d) => (
                      <option key={d.value} value={d.value}>
                        {d.value}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field label="Sub-disposition">
                  <Select
                    value={subDisposition}
                    onChange={(e) => {
                      setSubDisposition(e.target.value);
                      setSubSubDisposition("");
                    }}
                    disabled={!disposition}
                  >
                    <option value="">—</option>
                    {subOptions.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.value}
                      </option>
                    ))}
                  </Select>
                </Field>
                <div className="sm:col-span-2">
                  <Field label="Sub-sub-disposition">
                    <Select
                      value={subSubDisposition}
                      onChange={(e) => setSubSubDisposition(e.target.value)}
                      disabled={!subDisposition}
                    >
                      <option value="">—</option>
                      {subSubOptions.map((ss) => (
                        <option key={ss} value={ss}>
                          {ss}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
              </div>
            </Section>
            <NotesEditor label="Detail notes" value={smbDetailNotes} onChange={setSmbDetailNotes} />
          </div>
        )}

        <p className="rounded-lg border border-dashed border-crm-border bg-crm-panel/40 px-3 py-2 text-[11px] text-crm-muted">
          System activities (lead created, imported, stage changed) are logged automatically on
          the timeline.
        </p>
      </div>
    </Modal>
  );
}

function SegmentedTabs({
  tab,
  showLeadTabs,
  onSelect,
}: {
  tab: TabId;
  showLeadTabs: boolean;
  onSelect: (t: TabId) => void;
}) {
  const items: { id: TabId; label: string; icon: typeof FileText }[] = [
    { id: "generic", label: "Generic", icon: Layers },
    ...(showLeadTabs
      ? [
          { id: "lead-log" as const, label: "Lead log", icon: PhoneCall },
          { id: "smb" as const, label: "SMB", icon: Target },
        ]
      : []),
  ];
  return (
    <div
      className="flex gap-1 rounded-lg bg-crm-panel/80 p-1 ring-1 ring-crm-border"
      role="tablist"
    >
      {items.map(({ id, label, icon: Icon }) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={tab === id}
          onClick={() => onSelect(id)}
          className={
            "flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-2 text-xs font-medium transition sm:text-sm " +
            (tab === id
              ? "bg-white text-accent-700 shadow-sm ring-1 ring-crm-border"
              : "text-crm-muted hover:bg-white/60 hover:text-crm-text")
          }
        >
          <Icon size={14} className="shrink-0" />
          {label}
        </button>
      ))}
    </div>
  );
}

function Section({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h3 className="text-xs font-semibold uppercase tracking-wide text-crm-text">{title}</h3>
      {description ? <p className="mt-0.5 text-xs text-crm-muted">{description}</p> : null}
      <div className="mt-2.5">{children}</div>
    </section>
  );
}

function DynamicGenericFields(props: {
  type: GenericActivityType;
  subject: string;
  setSubject: (v: string) => void;
  outcome: string;
  setOutcome: (v: string) => void;
  durationMin: string;
  setDurationMin: (v: string) => void;
  followUpAt: string;
  setFollowUpAt: (v: string) => void;
  meetingAt: string;
  setMeetingAt: (v: string) => void;
  attendees: string;
  setAttendees: (v: string) => void;
  nextAction: string;
  setNextAction: (v: string) => void;
  emailRecipient: string;
  setEmailRecipient: (v: string) => void;
  emailStatus: string;
  setEmailStatus: (v: string) => void;
}) {
  const { type } = props;
  if (type === "Note" || type === "Task") {
    return (
      <Section title="Details">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label={type === "Note" ? "Title" : "Subject"}>
            <Input value={props.subject} onChange={(e) => props.setSubject(e.target.value)} />
          </Field>
        </div>
      </Section>
    );
  }
  if (type === "Call") {
    return (
      <Section title="Call details">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Duration (min)">
            <Input
              type="number"
              min={0}
              value={props.durationMin}
              onChange={(e) => props.setDurationMin(e.target.value)}
            />
          </Field>
          <Field label="Call outcome">
            <Input value={props.outcome} onChange={(e) => props.setOutcome(e.target.value)} />
          </Field>
          <Field label="Follow-up">
            <Input
              type="datetime-local"
              value={props.followUpAt}
              onChange={(e) => props.setFollowUpAt(e.target.value)}
            />
          </Field>
        </div>
      </Section>
    );
  }
  if (type === "Meeting") {
    return (
      <Section title="Meeting details">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Meeting date">
            <Input
              type="datetime-local"
              value={props.meetingAt}
              onChange={(e) => props.setMeetingAt(e.target.value)}
            />
          </Field>
          <Field label="Attendees">
            <Input
              value={props.attendees}
              onChange={(e) => props.setAttendees(e.target.value)}
              placeholder="Names, comma-separated"
            />
          </Field>
          <div className="sm:col-span-2">
            <Field label="Next action">
              <Input value={props.nextAction} onChange={(e) => props.setNextAction(e.target.value)} />
            </Field>
          </div>
        </div>
      </Section>
    );
  }
  if (type === "Email") {
    return (
      <Section title="Email details">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Subject">
            <Input value={props.subject} onChange={(e) => props.setSubject(e.target.value)} />
          </Field>
          <Field label="Recipient">
            <Input
              value={props.emailRecipient}
              onChange={(e) => props.setEmailRecipient(e.target.value)}
            />
          </Field>
          <Field label="Status">
            <Select
              value={props.emailStatus}
              onChange={(e) => props.setEmailStatus(e.target.value)}
            >
              <option value="">—</option>
              <option value="Sent">Sent</option>
              <option value="Opened">Opened</option>
              <option value="Replied">Replied</option>
              <option value="Bounced">Bounced</option>
            </Select>
          </Field>
        </div>
      </Section>
    );
  }
  return null;
}

function NotesEditor({
  label,
  value,
  onChange,
  onTemplate,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  onTemplate?: (text: string) => void;
}) {
  const id = useId();
  return (
    <Section title={label}>
      <div className="mb-2 flex flex-wrap gap-1">
        <ToolbarBtn
          icon={List}
          title="Bullet list"
          onClick={() => onChange(value ? `${value}\n• ` : "• ")}
        />
        <ToolbarBtn
          icon={ClipboardList}
          title="Insert link"
          onClick={() => {
            const url = window.prompt("Link URL");
            if (url) onChange(value ? `${value}\n${url}` : url);
          }}
        />
        {onTemplate
          ? NOTE_TEMPLATES.map((t) => (
              <button
                key={t.label}
                type="button"
                className="rounded-md border border-crm-border bg-white px-2 py-0.5 text-[10px] font-medium text-crm-muted hover:border-accent-300 hover:text-accent-700"
                onClick={() => onTemplate(t.text)}
              >
                {t.label}
              </button>
            ))
          : null}
      </div>
      <textarea
        id={id}
        className="crm-input min-h-[5rem] w-full resize-y text-sm leading-relaxed"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Add notes, @mentions, and context…"
      />
      <p className="mt-1 text-[10px] text-crm-muted">
        Rich formatting stored as plain text · attachments coming soon
      </p>
    </Section>
  );
}

function ToolbarBtn({
  icon: Icon,
  title,
  onClick,
}: {
  icon: typeof List;
  title: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className="flex h-7 w-7 items-center justify-center rounded-md border border-crm-border text-crm-muted hover:bg-crm-panel hover:text-crm-text"
    >
      <Icon size={14} />
    </button>
  );
}

function OptionsRow({
  reminderOn,
  setReminderOn,
  followUpAt,
  setFollowUpAt,
  visibility,
  setVisibility,
  onLoadDraft,
  hideReminder,
}: {
  reminderOn: boolean;
  setReminderOn: (v: boolean) => void;
  followUpAt: string;
  setFollowUpAt: (v: string) => void;
  visibility: ActivityVisibility;
  setVisibility: (v: ActivityVisibility) => void;
  onLoadDraft?: () => void;
  hideReminder?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 rounded-lg bg-crm-panel/30 px-3 py-2.5 ring-1 ring-crm-border/80">
      {!hideReminder ? (
        <label className="flex cursor-pointer items-center gap-2 text-xs text-crm-text">
          <input
            type="checkbox"
            checked={reminderOn}
            onChange={(e) => setReminderOn(e.target.checked)}
            className="rounded border-crm-border text-accent-600"
          />
          Follow-up reminder
        </label>
      ) : null}
      {reminderOn && !hideReminder ? (
        <Field label="Remind at">
          <Input
            type="datetime-local"
            value={followUpAt}
            onChange={(e) => setFollowUpAt(e.target.value)}
          />
        </Field>
      ) : null}
      <Field label="Visibility">
        <Select
          value={visibility}
          onChange={(e) => setVisibility(e.target.value as ActivityVisibility)}
        >
          {VISIBILITY_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
      </Field>
      {onLoadDraft ? (
        <button
          type="button"
          className="ml-auto text-xs font-medium text-accent-700 hover:underline"
          onClick={onLoadDraft}
        >
          Load draft
        </button>
      ) : null}
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  const fieldId = useId();
  const control =
    isValidElement(children) && !children.props.id
      ? cloneElement(children as React.ReactElement<{ id?: string }>, { id: fieldId })
      : children;
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1 block text-xs font-medium text-crm-muted">
        {label}
      </label>
      {control}
    </div>
  );
}
