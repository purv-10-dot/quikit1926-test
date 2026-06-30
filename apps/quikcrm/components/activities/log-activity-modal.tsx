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
  List,
  Sparkles,
  User,
  X,
} from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { SearchableSelect } from "@/components/activities/log-activity/searchable-select";
import { ActivityFieldInputs } from "@/components/activities/activity-field-inputs";
import {
  VISIBILITY_OPTIONS,
  formatVisibilityPrefix,
  sourceBadgeClass,
  type ActivityVisibility,
} from "@/lib/activities/activity-type-meta";
import type {
  ActivityTypeDefinition,
  ActivityFieldDefinition,
} from "@/types/activity-type";

export type LeadContext = {
  id: string;
  label: string;
  source?: string | null;
  stage?: string | null;
  ownerName?: string | null;
};

type RelatedOption = { id: string; label: string };

// "None" = standalone activity (no linked record). The 4 lookup kinds follow.
const STANDALONE_KIND = "None" as const;
const LOOKUP_KINDS = ["Lead", "Opportunity", "Contact", "Account"] as const;
const KIND_OPTIONS = [STANDALONE_KIND, ...LOOKUP_KINDS] as const;
type LookupKind = (typeof LOOKUP_KINDS)[number];
const KIND_LABELS: Record<(typeof KIND_OPTIONS)[number], string> = {
  None: "None (Standalone)",
  Lead: "Lead",
  Opportunity: "Opportunity",
  Contact: "Contact",
  Account: "Account",
};
const DRAFT_STORAGE_KEY = "quikcrm.activity-composer.draft.v1";

// Generic + Lead-log were collapsed into one type-driven activity composer.
// The SMB outreach UI has been removed from this modal; its API
// (/api/activities/smb-outreach) is unaffected and covered by its own tests.

interface Props {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /**
   * Retained for API compatibility with existing call sites. Previously gated
   * the SMB outreach tab (now removed); the activity composer itself is shown
   * to anyone who can open this modal.
   */
  canViewLeads?: boolean;
  initialLead?: LeadContext | null;
  initialRelated?: { kind: (typeof KIND_OPTIONS)[number]; id: string; label: string } | null;
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
  initialLead = null,
  initialRelated = null,
}: Props) {
  const toast = useToast();
  const [submitting, setSubmitting] = useState(false);
  const [reminderOn, setReminderOn] = useState(false);
  const [visibility, setVisibility] = useState<ActivityVisibility>("team");

  const [lead, setLead] = useState<LeadContext | null>(initialLead);

  // Type-driven activity composer.
  const [types, setTypes] = useState<ActivityTypeDefinition[] | null>(null);
  const [activityTypeId, setActivityTypeId] = useState("");
  const [fieldDefs, setFieldDefs] = useState<ActivityFieldDefinition[]>([]);
  const [fieldsLoading, setFieldsLoading] = useState(false);
  const [fieldValues, setFieldValues] = useState<Record<string, unknown>>({});

  const [relatedKind, setRelatedKind] =
    useState<(typeof KIND_OPTIONS)[number]>("Lead");
  const [relatedObjectId, setRelatedObjectId] = useState("");
  const [activityNotes, setActivityNotes] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");

  // Keyed by the lookup kinds only — "None" (standalone) has no record options.
  const [relatedOptions, setRelatedOptions] = useState<
    Record<LookupKind, RelatedOption[] | undefined>
  >({ Lead: undefined, Opportunity: undefined, Contact: undefined, Account: undefined });
  const [relatedLoading, setRelatedLoading] = useState(false);

  const selectedType = types?.find((t) => t.id === activityTypeId) ?? null;

  const isStandalone = relatedKind === STANDALONE_KIND;

  const contextRecordLabel = useMemo(() => {
    if (relatedKind === STANDALONE_KIND) return null;
    const opt = relatedOptions[relatedKind]?.find((o) => o.id === relatedObjectId);
    return opt?.label ?? (relatedKind === "Lead" && lead?.label) ?? null;
  }, [relatedKind, relatedObjectId, relatedOptions, lead]);

  const resetForm = useCallback(() => {
    setLead(initialLead);
    setSubmitting(false);
    setReminderOn(false);
    setVisibility("team");
    setActivityTypeId("");
    setFieldDefs([]);
    setFieldValues({});
    setActivityNotes("");
    setFollowUpAt("");
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
  }, [initialLead, initialRelated]);

  useEffect(() => {
    if (!open) return;
    resetForm();
  }, [open, resetForm]);

  // Activity tab: load the org's active types once the modal opens.
  useEffect(() => {
    if (!open) return;
    if (types !== null) return;
    void fetch("/api/activities/types")
      .then((r) => (r.ok ? r.json() : null))
      .then((body) => setTypes(Array.isArray(body?.data) ? body.data : []))
      .catch(() => setTypes([]));
  }, [open, types]);

  // When a type is picked, fetch its field definitions and render them below
  // the Type selector. `ignore` guards against a stale response winning a race
  // when the user switches types quickly (Call → Meeting): only the latest
  // selection's fields are applied. A failed fetch surfaces a toast instead of
  // silently showing no fields (which previously looked like "nothing happened").
  useEffect(() => {
    if (!open || !activityTypeId) {
      setFieldDefs([]);
      return;
    }
    let ignore = false;
    setFieldsLoading(true);
    setFieldValues({});
    void fetch(`/api/activities/types/${activityTypeId}/fields`)
      .then(async (r) => {
        if (!r.ok) throw new Error(`Failed to load fields (${r.status})`);
        return r.json();
      })
      .then((body) => {
        if (ignore) return;
        setFieldDefs(Array.isArray(body?.data) ? body.data : []);
      })
      .catch(() => {
        if (ignore) return;
        setFieldDefs([]);
        toast.error("Could not load fields for this activity type");
      })
      .finally(() => {
        if (!ignore) setFieldsLoading(false);
      });
    return () => {
      ignore = true;
    };
  }, [open, activityTypeId, toast]);

  const fetchRelatedOptions = useCallback(
    async (kind: LookupKind): Promise<RelatedOption[]> => {
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
    if (!open) return;
    if (relatedKind === STANDALONE_KIND) return; // no lookup for standalone
    if (relatedOptions[relatedKind] !== undefined) return;
    setRelatedLoading(true);
    fetchRelatedOptions(relatedKind)
      .then((items) => setRelatedOptions((prev) => ({ ...prev, [relatedKind]: items })))
      .catch(() => setRelatedOptions((prev) => ({ ...prev, [relatedKind]: [] })))
      .finally(() => setRelatedLoading(false));
  }, [open, relatedKind, relatedOptions, fetchRelatedOptions]);

  function saveDraft() {
    try {
      const payload = {
        activityTypeId,
        relatedKind,
        relatedObjectId,
        activityNotes,
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
        activityTypeId?: string;
        relatedKind?: (typeof KIND_OPTIONS)[number];
        relatedObjectId?: string;
        activityNotes?: string;
        visibility?: ActivityVisibility;
      };
      if (d.activityTypeId) setActivityTypeId(d.activityTypeId);
      if (d.relatedKind) setRelatedKind(d.relatedKind);
      if (d.relatedObjectId) setRelatedObjectId(d.relatedObjectId);
      if (d.activityNotes) setActivityNotes(d.activityNotes);
      if (d.visibility) setVisibility(d.visibility);
      toast.success("Draft restored");
    } catch {
      toast.error("Could not load draft");
    }
  }

  async function submitActivity() {
    if (!selectedType) {
      toast.error("Pick an activity type first");
      return;
    }
    setSubmitting(true);
    try {
      const notes = buildDetailNotes(activityNotes, {}, visibility);
      const res = await fetch("/api/activities", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          type: selectedType.label,
          activityTypeId: selectedType.id,
          relatedKind,
          // Standalone activities send no record id; the API stores the sentinel.
          relatedObjectId: isStandalone ? undefined : relatedObjectId,
          fieldValues,
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

  const hasTypes = (types?.length ?? 0) > 0;
  const submit = submitActivity;

  const submitDisabled =
    submitting ||
    !activityTypeId ||
    !relatedKind ||
    // Standalone needs no record; linked kinds require one.
    (!isStandalone && !relatedObjectId);

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
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ring-2 ring-accent-200 bg-white">
              <FileText size={18} className="text-accent-600" />
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

        <div className="space-y-4">
          {types === null ? (
              <p className="px-1 py-6 text-center text-sm text-crm-muted">Loading…</p>
            ) : !hasTypes ? (
              <div className="rounded-lg border border-dashed border-crm-border bg-crm-panel/40 px-4 py-8 text-center">
                <p className="text-sm font-medium text-crm-text">No activity types configured</p>
                <p className="mx-auto mt-1 max-w-sm text-sm text-crm-muted">
                  Ask your admin to set up activity types in Settings → Activity Types before
                  logging.
                </p>
              </div>
            ) : (
              <>
                <Section title="Activity" description="Pick a type, then fill its fields.">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <Field label="Type">
                      <Select
                        value={activityTypeId}
                        onChange={(e) => setActivityTypeId(e.target.value)}
                      >
                        <option value="">Select a type…</option>
                        {types!.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
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
                            {KIND_LABELS[k]}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="sm:col-span-2">
                      {relatedKind === STANDALONE_KIND ? (
                        <p className="rounded-lg border border-dashed border-crm-border bg-crm-panel/40 px-3 py-2 text-xs text-crm-muted">
                          This activity is not linked to any CRM record. You can link it later.
                        </p>
                      ) : (
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
                      )}
                    </div>
                  </div>
                </Section>

                {activityTypeId ? (
                  fieldsLoading ? (
                    <p className="px-1 py-3 text-sm text-crm-muted">Loading fields…</p>
                  ) : fieldDefs.length > 0 ? (
                    <Section title={`${selectedType?.label ?? "Type"} fields`}>
                      <ActivityFieldInputs
                        fields={fieldDefs}
                        values={fieldValues}
                        onChange={setFieldValues}
                      />
                    </Section>
                  ) : null
                ) : null}

                <NotesEditor label="Notes" value={activityNotes} onChange={setActivityNotes} />

                <OptionsRow
                  reminderOn={reminderOn}
                  setReminderOn={setReminderOn}
                  followUpAt={followUpAt}
                  setFollowUpAt={setFollowUpAt}
                  visibility={visibility}
                  setVisibility={setVisibility}
                  onLoadDraft={loadDraft}
                />
              </>
            )}
        </div>

        <p className="rounded-lg border border-dashed border-crm-border bg-crm-panel/40 px-3 py-2 text-[11px] text-crm-muted">
          System activities (lead created, imported, stage changed) are logged automatically on
          the timeline.
        </p>
      </div>
    </Modal>
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

function NotesEditor({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
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
