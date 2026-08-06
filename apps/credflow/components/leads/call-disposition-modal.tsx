// apps/quikcrm/components/leads/call-disposition-modal.tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import {
  postCallLog,
  fetchDispositions,
  fetchUsersPicker,
  postPaymentVerification,
  type CallDisposition,
} from "@/lib/api-client";
import {
  evaluateFormRules,
  type EvalRule,
  type RuleDecision,
} from "@/lib/services/forms/form-rule-evaluator";
import { fieldRendered } from "@/lib/services/forms/field-visibility";
import {
  frreFieldMandatory,
  type FrreField,
  type FrreTab,
} from "@/components/leads/disposition/disposition-field-groups";
import { CleanDispositionForm } from "@/components/leads/disposition/clean-disposition-form";
import { buildCleanCallLogPayload, initialActivityDateTime, isFieldEmpty } from "@/lib/services/forms/clean-call-log-payload";

// FR-RE: the live disposition-form runtime the agent renders + evaluates
// (FrreField/FrreTab are shared with <DispositionFieldGroups>).
interface FrreRuntime {
  versionId: string;
  tabs: FrreTab[];
  fields: FrreField[];
  rules: EvalRule[];
}

interface DispositionSection {
  id: string;
  code: string;
  label: string;
}

/**
 * Two-stage modal:
 *   Stage 1 — pick a disposition section.
 *   Stage 2 — fill notes + optional follow-up; submit.
 *
 * Submit target depends on the call context:
 *   - When the parent (CallModal) supplies callLogContext, this modal POSTs
 *     to /api/telephony/call-logs. The server-side createCallLog writes the
 *     CrmCallLog row, links the lead, applies the lead-stage transition, and
 *     creates the CrmActivity entry — all in one transaction.
 *   - When called from a manual "Add disposition" flow without an actual
 *     call (e.g. from lead-action-bar), it falls back to POSTing a plain
 *     CrmActivity to /api/activities — preserving the legacy no-call path.
 */
export function CallDispositionModal({
  open,
  leadId,
  sections,
  onClose,
  callLogContext,
}: {
  open: boolean;
  leadId: string | null;
  sections: DispositionSection[];
  onClose: () => void;
  callLogContext?: {
    toNumber: string;
    fromNumber?: string | null;
    durationSec?: number;
    providerCallSid?: string | null;
    /** Forwarded to the call-logs POST. Stamped by CallModal: "agent" when
     *  the End-call button was clicked; "customer" when the webhook
     *  auto-advanced the stage. */
    endedBy?: "agent" | "customer" | "system" | "unknown" | null;
  };
}) {
  const router = useRouter();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [outcome, setOutcome] = useState("");
  const [saving, setSaving] = useState(false);

  function close() {
    setSelectedId(null);
    setNotes("");
    setFollowUpAt("");
    setOutcome("");
    onClose();
  }

  async function submit() {
    if (!selectedId) return;
    const section = sections.find((s) => s.id === selectedId);
    if (!section) return;

    // Combine outcome (free-text sub-status) into the notes the server stores.
    // Disposition name itself is taken from `section.label` server-side via
    // CrmCallDisposition.name/label, so we don't repeat it here.
    const combinedNotes = outcome
      ? `Outcome: ${outcome}${notes ? `\n\n${notes}` : ""}`
      : notes;

    setSaving(true);
    try {
      // Convert the datetime-local value (no timezone) to a full ISO string
      // so the server's z.string().datetime() validator accepts it.
      const followUpIso = followUpAt
        ? new Date(followUpAt).toISOString()
        : null;

      if (callLogContext) {
        await postCallLog({
          source: "dialer", // CallDispositionModal posts only after a real call
          toNumber: callLogContext.toNumber,
          fromNumber: callLogContext.fromNumber ?? null,
          durationSec: callLogContext.durationSec ?? null,
          callDispositionId: section.id,
          linkedLeadId: leadId ?? null,
          providerCallSid: callLogContext.providerCallSid ?? null,
          notes: combinedNotes || null,
          followUpAt: followUpIso,
          endedBy: callLogContext.endedBy ?? null,
        });
        toast.success(`Disposition "${section.label}" recorded`);
      } else {
        // Legacy manual-disposition path (no real call): write a plain
        // CrmActivity. lead-action-bar's "Add disposition" button uses this.
        if (!leadId) {
          throw new Error("Lead is required when logging a disposition without an active call");
        }
        const res = await fetch("/api/activities", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: "Call",
            relatedKind: "lead",
            relatedObjectId: leadId,
            subject: section.label,
            outcome: outcome || section.label,
            activityCode: section.code,
            logOutcome: outcome,
            detailNotes: notes,
            followUpAt: followUpAt || null,
            leadId,
            occurredAt: new Date().toISOString(),
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to record disposition");
        toast.success(`Disposition "${section.label}" recorded`);
      }
      router.refresh();
      close();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to record disposition");
    } finally {
      setSaving(false);
    }
  }

  // Stage 1: section picker
  if (!selectedId) {
    return (
      <Modal open={open} onClose={close} title="Call disposition" width="max-w-lg">
        <p className="mb-3 text-sm text-crm-muted">Select a section to open.</p>
        <ul className="divide-y divide-crm-border rounded-lg border border-crm-border">
          {sections.length === 0 ? (
            <li className="px-4 py-6 text-center text-sm text-crm-muted">
              No dispositions configured. Add some at{" "}
              <a className="crm-link" href="/telephony/dispositions">
                Telephony → Dispositions
              </a>
              .
            </li>
          ) : (
            sections.map((s) => (
              <li key={s.id}>
                <button
                  onClick={() => setSelectedId(s.id)}
                  className="block w-full px-4 py-3 text-left text-sm hover:bg-crm-panel"
                >
                  {s.label}
                </button>
              </li>
            ))
          )}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
        </div>
      </Modal>
    );
  }

  // Stage 2: fill form for selected section
  const section = sections.find((s) => s.id === selectedId)!;
  return (
    <Modal open={open} onClose={close} title={section.label} width="max-w-lg">
      <div className="space-y-3">
        <Field label="Outcome / sub-status">
          <Input
            placeholder="e.g. Interested, Will call back, Wrong number…"
            value={outcome}
            onChange={(e) => setOutcome(e.target.value)}
          />
        </Field>
        <Field label="Detail notes">
          <textarea
            className="crm-input min-h-[80px]"
            placeholder="What happened on the call?"
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>
        <Field label="Follow-up at (optional)">
          <Input type="datetime-local" value={followUpAt} onChange={(e) => setFollowUpAt(e.target.value)} />
        </Field>
      </div>
      <div className="mt-5 flex justify-between">
        <button onClick={() => setSelectedId(null)} className="text-sm text-crm-muted hover:text-crm-text">
          ← Back to sections
        </button>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={close}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "Saving…" : "Record disposition"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block font-medium text-crm-text">{label}</span>
      {children}
    </label>
  );
}

/** Helper hook — fetches dispositions on mount; callers cache the array and pass to <CallDispositionModal />. */
export function useDispositions() {
  // intentionally undefined here; callers fetch via fetch("/api/telephony/dispositions")
  return null;
}

// ============================================================================
// LeadCallDispositionModal — full port of the legacy
// LeadCallDispositionModal.tsx. Drives the manual "Call disposition" flow on
// the Lead Detail page: a 4-item menu, a 2-step call wizard with stage/status
// gating, and a payment-verification view that triggers either from the menu
// shortcut or after a payment-flagged disposition.
// ============================================================================

type ModalView = "menu" | "call" | "payment";
type WizardStep = 0 | 1;

interface StatusRule {
  subStages: string[];
  reasons: string[];
  needsDateTime?: boolean;
  nextStage: string;
}

interface CallDispositionFieldConfig {
  id?: string;
  key: string;
  label: string;
  type?: "text" | "number" | "datetime" | "select";
  required?: boolean;
  options?: string[];
}

interface CallDispositionStatusConfig {
  name: string;
  leadStages?: string[];
  subStages?: string[];
  reasons?: string[];
  needsDateTime?: boolean;
  nextStage?: string;
}

interface CallDispositionConfig {
  fields?: CallDispositionFieldConfig[];
  statuses?: CallDispositionStatusConfig[];
}

function normalizeDispositionConfig(config: unknown): CallDispositionConfig {
  if (!config || typeof config !== "object") return {};
  const raw = config as Record<string, unknown>;
  return {
    fields: Array.isArray(raw.fields) ? (raw.fields as CallDispositionFieldConfig[]) : [],
    statuses: Array.isArray(raw.statuses) ? (raw.statuses as CallDispositionStatusConfig[]) : [],
  };
}

const STATUS_RULES: Record<string, StatusRule> = {
  Disqualified: {
    subStages: ["Disqualified", "Rechurned Disqualified"],
    reasons: ["Not using Tally/Busy", "Invalid client details", "Student Lead", "Other"],
    nextStage: "Disqualified",
  },
  "Could Not Connect": {
    subStages: ["1. No. Busy", "2. Not reachable", "3. Invalid No.", "4. Switch off"],
    reasons: ["No. Busy", "Not reachable", "Invalid No.", "Switch off"],
    needsDateTime: true,
    nextStage: "Not Connected (New Lead)",
  },
  "Discussion Pending (Answered Calls)": {
    subStages: ["Follow Up Required"],
    reasons: ["Can't talk right now", "Internet Issue", "Other"],
    needsDateTime: true,
    nextStage: "Discussion Pending",
  },
  "Demo Scheduled": {
    subStages: ["For Scheduling Demo", "Demo Now"],
    reasons: ["Qualified Lead", "Using Tally", "Using Busy", "Others"],
    needsDateTime: true,
    nextStage: "Demo Scheduled",
  },
  "Demo Completed": {
    subStages: ["Demo Completed with Demo Data", "Demo Completed with Synced Data"],
    reasons: ["Demo done"],
    needsDateTime: true,
    nextStage: "Demo Done - Demo Data",
  },
  "Payment Link Sent": {
    subStages: ["1. TL to revert", "2. Wait for the Confirmation"],
    reasons: ["Payment discussion pending"],
    nextStage: "Payment Link Sent",
  },
  "Interested Followup": {
    subStages: ["1. For Payment discussion", "2. For free trial"],
    reasons: ["Interested"],
    nextStage: "Interested Followup",
  },
  "Not Interested": {
    subStages: ["In Scheduling Demo", "For Demo Done", "For making payment"],
    reasons: ["Requirement Mismatch", "Issue during trial", "Price issue", "Other"],
    nextStage: "Not Interested",
  },
  "Future Lead": {
    subStages: ["Future Lead"],
    reasons: ["Follow up later"],
    nextStage: "Future Lead",
  },
  "Payment Done": {
    subStages: ["Payment Done"],
    reasons: ["Payment received"],
    needsDateTime: true,
    nextStage: "Payment Done",
  },
};

const STAGE_STATUS_OPTIONS: Record<string, string[]> = {
  "new lead": ["Could Not Connect", "Discussion Pending (Answered Calls)", "Demo Scheduled", "Not Interested", "Future Lead", "Disqualified"],
  "not connected (new lead)": ["Could Not Connect", "Discussion Pending (Answered Calls)", "Demo Scheduled", "Not Interested", "Future Lead", "Disqualified"],
  "discussion pending": ["Could Not Connect", "Demo Scheduled", "Not Interested", "Future Lead", "Disqualified"],
  "demo scheduled": ["Could Not Connect", "Demo Completed", "Payment Link Sent", "Not Interested", "Future Lead"],
  "demo done - demo data": ["Could Not Connect", "Interested Followup", "Payment Link Sent", "Not Interested", "Future Lead", "Payment Done"],
  "demo done - sync data": ["Could Not Connect", "Interested Followup", "Payment Link Sent", "Not Interested", "Future Lead", "Payment Done"],
  "interested followup": ["Could Not Connect", "Payment Link Sent", "Not Interested", "Future Lead", "Payment Done"],
  "payment link sent": ["Could Not Connect", "Not Interested", "Future Lead", "Payment Done"],
};

const MENU_ITEMS = [
  { id: "part2", label: "1. Call Disposition - Part2", kind: "call" as const },
  { id: "payment-clone", label: "Additional Payment Form - Clone", kind: "payment" as const },
  { id: "invoice", label: "Invoice Sent", kind: "payment" as const },
  { id: "payment-verification", label: "Payment Verification", kind: "payment" as const },
];

interface LeadCallDispositionModalProps {
  open: boolean;
  leadId: string;
  leadStage?: string;
  defaultToNumber: string;
  providerCallSid?: string;
  /** Stage 3-D(a): "dialer" when opened after a real call (writes a CrmCallLog
   *  row); "manual" when opened from lead details (activities only). Required —
   *  set by the parent that knows the context, never inferred. */
  source: "dialer" | "manual";
  initialView?: "menu" | "call";
  onClose: () => void;
  onSaved: () => void;
}

export function LeadCallDispositionModal({
  open,
  leadId,
  leadStage,
  defaultToNumber,
  providerCallSid,
  source,
  initialView = "menu",
  onClose,
  onSaved,
}: LeadCallDispositionModalProps) {
  const [view, setView] = useState<ModalView>("menu");
  const [step, setStep] = useState<WizardStep>(0);
  const [dispositions, setDispositions] = useState<CallDisposition[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [toNumber, setToNumber] = useState("");
  const [fromNumber, setFromNumber] = useState("");
  const [durationSec, setDurationSec] = useState("60");
  const [selectedStatus, setSelectedStatus] = useState("");
  const [selectedSubStage, setSelectedSubStage] = useState("");
  const [selectedReason, setSelectedReason] = useState("");
  const [dateTimeValue, setDateTimeValue] = useState("");
  const [demoScheduledBy, setDemoScheduledBy] = useState("");
  const [demoScheduledOn, setDemoScheduledOn] = useState("");
  const [demoDateTime, setDemoDateTime] = useState("");
  const [notes, setNotes] = useState("");
  const [followUpAt, setFollowUpAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [pendingCallLogId, setPendingCallLogId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState("");
  const [paymentRef, setPaymentRef] = useState("");
  const [paymentMode, setPaymentMode] = useState("UPI");
  const [paymentNotes, setPaymentNotes] = useState("");
  const [savingPayment, setSavingPayment] = useState(false);
  const [demoScheduledByOptions, setDemoScheduledByOptions] = useState<string[]>([]);
  const [customFieldValues, setCustomFieldValues] = useState<Record<string, string>>({});

  // FR-RE: live disposition-form runtime + the agent's entries. Gated behind a
  // live form set existing — when null, the modal behaves exactly as before.
  const toast = useToast();
  const [formRuntime, setFormRuntime] = useState<FrreRuntime | null>(null);
  // string for most fields; string[] for a multi user_picker (widened pipeline).
  const [formFieldValues, setFormFieldValues] = useState<Record<string, string | string[]>>({});

  const selectedDisposition = useMemo(
    () => dispositions.find((d) => d.id === selectedId) ?? null,
    [dispositions, selectedId],
  );
  const selectedDispositionConfig = useMemo(
    () => normalizeDispositionConfig(selectedDisposition?.config),
    [selectedDisposition?.config],
  );
  const configuredStatuses = selectedDispositionConfig.statuses ?? [];
  const stageKey = (leadStage ?? "New Lead").trim().toLowerCase();
  const stageMatchedConfiguredStatuses = configuredStatuses.filter((s) => {
    const stages = (s.leadStages ?? []).map((x) => x.trim().toLowerCase());
    return stages.length === 0 || stages.includes(stageKey);
  });
  const allowedStatuses =
    configuredStatuses.length > 0
      ? (stageMatchedConfiguredStatuses.length > 0 ? stageMatchedConfiguredStatuses : configuredStatuses).map(
          (s) => s.name,
        )
      : (STAGE_STATUS_OPTIONS[stageKey] ?? STAGE_STATUS_OPTIONS["new lead"]);
  const activeStatusRule =
    configuredStatuses.length > 0
      ? (() => {
          const active = configuredStatuses.find((s) => s.name === selectedStatus);
          if (!active) return null;
          return {
            subStages: active.subStages ?? [],
            reasons: active.reasons ?? [],
            needsDateTime: !!active.needsDateTime,
            nextStage: active.nextStage ?? leadStage ?? "New Lead",
          } as StatusRule;
        })()
      : (STATUS_RULES[selectedStatus] ?? null);
  const showDemoBlock = selectedStatus === "Demo Scheduled";

  // FR-RE: the custom (non-protected) form fields the agent fills, and the LIVE
  // decision — computed by the SAME pure engine used server-side (form-rule-
  // evaluator), recomputed as the agent types. Drives live show/hide/mandatory
  // and the "will set Contact Stage" hint. The server re-applies authoritatively.
  const frreFields = (formRuntime?.fields ?? []).filter((f) => !f.isProtected);
  const liveDecision = useMemo<RuleDecision | null>(() => {
    if (!formRuntime) return null;
    return evaluateFormRules(
      {
        fieldValues: formFieldValues,
        stage: leadStage ?? null,
        status: selectedStatus || null,
        subStage: selectedSubStage || null,
      },
      formRuntime.rules,
    );
  }, [formRuntime, formFieldValues, leadStage, selectedStatus, selectedSubStage]);
  // Visibility/rendering is shared (lib/services/forms/field-visibility +
  // <DispositionFieldGroups>). frreTabsById feeds the submit-time required check.
  const frreTabsById = new Map<string, FrreTab>((formRuntime?.tabs ?? []).map((t) => [t.id, t]));

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setView(initialView);
    setStep(0);
    setErr(null);
    setSelectedId("");
    setFromNumber("");
    setDurationSec("60");
    setToNumber(defaultToNumber.trim());
    setSelectedStatus("");
    setSelectedSubStage("");
    setSelectedReason("");
    // Activity date+time (Option A, WYSIWYG): prefill the open-time so an
    // untouched save stores the shown time, not a save-time stamp.
    setDateTimeValue(initialActivityDateTime(new Date()));
    setDemoScheduledBy("");
    setDemoScheduledOn("");
    setDemoDateTime("");
    setNotes("");
    setFollowUpAt("");
    setPaymentAmount("");
    setPaymentRef("");
    setPaymentMode("UPI");
    setPaymentNotes("");
    setCustomFieldValues({});
    setFormFieldValues({});
    setPendingCallLogId(null);
    void (async () => {
      try {
        const { items } = await fetchDispositions();
        if (!cancelled) setDispositions(items);
      } catch {
        if (!cancelled) setDispositions([]);
      }
    })();
    // FR-RE: load the live disposition-form runtime (null => no live form => the
    // modal behaves exactly as today, no FR-RE fields).
    void (async () => {
      try {
        const res = await fetch("/api/forms/runtime", { credentials: "include" });
        const json = await res.json();
        if (!cancelled) setFormRuntime(res.ok ? (json.data as FrreRuntime | null) : null);
      } catch {
        if (!cancelled) setFormRuntime(null);
      }
    })();
    void (async () => {
      try {
        const { items } = await fetchUsersPicker();
        if (cancelled) return;
        const names = [...new Set(items.map((u) => (u.name ?? "").trim()).filter(Boolean))];
        setDemoScheduledByOptions(names);
      } catch {
        if (!cancelled) setDemoScheduledByOptions([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, defaultToNumber, initialView]);

  useEffect(() => {
    setSelectedStatus("");
    setSelectedSubStage("");
    setSelectedReason("");
    setCustomFieldValues({});
  }, [selectedId]);

  useEffect(() => {
    if (!open) return;
    if (selectedId) return;
    if (dispositions.length === 0) return;
    setSelectedId(dispositions[0].id);
  }, [open, selectedId, dispositions]);

  async function submitCallDisposition() {
    if (!selectedId) return setErr("Disposition is required.");
    if (!selectedStatus) return setErr("Status is required.");
    if (!selectedSubStage) return setErr("Sub Stage is required.");
    if (!selectedReason) return setErr("Reason is required.");
    if (activeStatusRule?.needsDateTime && !(dateTimeValue || followUpAt))
      return setErr("Date and Time is required.");
    if (showDemoBlock && !demoScheduledBy.trim()) return setErr("Demo Scheduled By is required.");
    if (showDemoBlock && !demoScheduledOn) return setErr("Demo Scheduled On is required.");
    for (const field of selectedDispositionConfig.fields ?? []) {
      const key = field.key?.trim();
      if (!key) continue;
      if (field.required && !(customFieldValues[key] ?? "").trim()) {
        return setErr(`${field.label || key} is required.`);
      }
    }
    // FR-RE: required custom fields (skip ones a rule hides; honor live mandatory).
    for (const f of frreFields) {
      if (!fieldRendered(f, liveDecision, frreTabsById)) continue; // not shown -> not required
      if (frreFieldMandatory(f, liveDecision) && isFieldEmpty(formFieldValues[f.fieldKey])) {
        return setErr(`${f.label} is required.`);
      }
    }

    const to = toNumber.trim() || defaultToNumber.trim();
    if (!to) return setErr("Customer number is required.");

    setSaving(true);
    setErr(null);
    try {
      const dynamicNotes = (selectedDispositionConfig.fields ?? [])
        .map((field) => {
          const key = field.key?.trim();
          if (!key) return null;
          const value = (customFieldValues[key] ?? "").trim();
          if (!value) return null;
          return `${field.label || key}: ${value}`;
        })
        .filter(Boolean)
        .join("\n");
      const mergedNotes = [notes.trim(), dynamicNotes].filter(Boolean).join("\n");
      const row = await postCallLog({
        source,
        toNumber: to,
        fromNumber: fromNumber.trim() || null,
        durationSec: Math.max(0, Math.floor(Number.parseFloat(durationSec) || 0)),
        callDispositionId: selectedId,
        linkedLeadId: leadId,
        providerCallSid: providerCallSid?.trim() || null,
        status: selectedStatus,
        subStage: selectedSubStage,
        reason: selectedReason,
        nextStage: activeStatusRule?.nextStage || null,
        notes: mergedNotes || null,
        followUpAt: followUpAt ? new Date(followUpAt).toISOString() : null,
        activityDateTime: dateTimeValue ? new Date(dateTimeValue).toISOString() : undefined,
        demoScheduledBy: demoScheduledBy.trim() || null,
        demoScheduledOn: demoScheduledOn ? new Date(demoScheduledOn).toISOString() : null,
        // FR-RE: the agent's custom field values (only sent when a live form exists).
        dispositionFieldValues: formRuntime ? formFieldValues : undefined,
      });
      setPendingCallLogId(row.id);
      // FR-RE: surface the rule decision the server applied (e.g. status moved).
      if (row.formDecision?.setStage) {
        toast.success(`Contact Stage → ${row.formDecision.setStage.status}`);
      }
      if (row.paymentVerificationRequired || selectedDisposition?.triggersPaymentVerification) {
        setView("payment");
      } else {
        onSaved();
        onClose();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save call disposition");
    } finally {
      setSaving(false);
    }
  }

  // FR-RE Stage 3-C: the clean-view Save. Option Y — no disposition pick; Status
  // is the single required selection (the disposition is resolved server-side).
  // Hard-required = a field's hard requiredLevel OR a make_mandatory rule fired,
  // AND the field is actually rendered (a rule-hidden field isn't required).
  async function submitCleanDisposition() {
    const to = toNumber.trim() || defaultToNumber.trim();
    if (!to) return setErr("Customer number is required.");

    const hardRequiredFieldKeys = frreFields
      .filter((f) => fieldRendered(f, liveDecision, frreTabsById) && frreFieldMandatory(f, liveDecision))
      .map((f) => f.fieldKey);

    const built = buildCleanCallLogPayload({
      toNumber: to,
      leadId,
      status: selectedStatus,
      subStage: selectedSubStage,
      notes,
      dateTimeValue,
      fieldValues: formFieldValues,
      hardRequiredFieldKeys,
    });
    if (!built.ok) return setErr(built.error);

    setSaving(true);
    setErr(null);
    try {
      const row = await postCallLog({
        ...built.payload,
        source,
        fromNumber: fromNumber.trim() || null,
        durationSec: Math.max(0, Math.floor(Number.parseFloat(durationSec) || 0)),
        providerCallSid: providerCallSid?.trim() || null,
      });
      setPendingCallLogId(row.id);
      if (row.formDecision?.setStage) {
        toast.success(`Contact Stage → ${row.formDecision.setStage.status}`);
      }
      if (row.paymentVerificationRequired) {
        setView("payment");
      } else {
        onSaved();
        onClose();
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Failed to save call disposition");
    } finally {
      setSaving(false);
    }
  }

  async function submitPaymentVerification() {
    const amount = Number.parseFloat(paymentAmount);
    if (!Number.isFinite(amount) || amount < 0) return setErr("Enter a valid amount.");
    setSavingPayment(true);
    setErr(null);
    try {
      await postPaymentVerification({
        leadId,
        callLogId: pendingCallLogId ?? undefined,
        amount,
        currency: "INR",
        reference: paymentRef,
        paymentMode,
        notes: paymentNotes,
      });
      onSaved();
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Payment verification failed");
    } finally {
      setSavingPayment(false);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/45 p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="w-full max-w-4xl rounded-xl border border-crm-border bg-white p-4 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {view === "menu" ? (
          <>
            <h2 className="text-base font-semibold text-crm-text">Call disposition</h2>
            <p className="mt-1 text-sm text-crm-muted">Select a section to open.</p>
            <div className="mt-3 rounded border border-crm-border">
              {MENU_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className="block w-full border-b border-crm-border px-3 py-2 text-left text-sm text-crm-text last:border-b-0 hover:bg-crm-panel"
                  onClick={() => {
                    setErr(null);
                    if (item.kind === "call") {
                      setView("call");
                      setStep(0);
                    } else {
                      setView("payment");
                    }
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
            <div className="mt-4 flex justify-end">
              <button
                type="button"
                className="rounded border border-crm-border bg-white px-4 py-2 text-sm font-medium text-crm-text hover:bg-crm-panel"
                onClick={onClose}
              >
                Cancel
              </button>
            </div>
          </>
        ) : null}

        {view === "call" ? (
          formRuntime ? (
            // Stage 2b: clean FR-RE form (gated on a live form). Legacy below is
            // the untouched fallback when no live form exists.
            <CleanDispositionForm
              runtime={formRuntime}
              leadStage={leadStage ?? null}
              decision={liveDecision}
              selectedStatus={selectedStatus}
              onStatusChange={setSelectedStatus}
              selectedSubStage={selectedSubStage}
              onSubStageChange={setSelectedSubStage}
              notes={notes}
              onNotesChange={setNotes}
              dateTimeValue={dateTimeValue}
              onDateTimeChange={setDateTimeValue}
              fieldValues={formFieldValues}
              onFieldChange={(k, v) => setFormFieldValues((prev) => ({ ...prev, [k]: v }))}
              error={err}
              saving={saving}
              onCancel={onClose}
              onSave={() => void submitCleanDisposition()}
            />
          ) : (
          <>
            <div className="flex items-center justify-between border-b border-crm-border pb-2">
              <h3 className="text-sm font-semibold text-crm-text">
                1. Call Disposition - Part2 - Call Disposition_First Call
              </h3>
              <button
                type="button"
                className="text-sm text-crm-muted hover:text-crm-text"
                onClick={onClose}
              >
                x
              </button>
            </div>
            <p className="mt-2 text-xs text-crm-muted">Section{step === 0 ? "1" : "3"}</p>
            {step === 0 ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-crm-text">
                  Disposition <span className="text-red-600">*</span>
                  <select
                    className="crm-input mt-1"
                    value={selectedId}
                    onChange={(e) => setSelectedId(e.target.value)}
                  >
                    <option value="">Select disposition</option>
                    {dispositions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name ?? d.label}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-crm-text">
                  Customer number (called party)
                  <input
                    type="tel"
                    className="crm-input mt-1 font-mono"
                    value={toNumber}
                    onChange={(e) => setToNumber(e.target.value)}
                  />
                </label>
                <label className="text-sm font-medium text-crm-text">
                  Your number (caller, optional)
                  <input
                    type="tel"
                    className="crm-input mt-1 font-mono"
                    value={fromNumber}
                    onChange={(e) => setFromNumber(e.target.value)}
                  />
                </label>
                <label className="text-sm font-medium text-crm-text">
                  Activity DateTime
                  <input
                    type="datetime-local"
                    className="crm-input mt-1"
                    value={dateTimeValue}
                    onChange={(e) => setDateTimeValue(e.target.value)}
                  />
                </label>
                <label className="text-sm font-medium text-crm-text sm:col-span-2">
                  Duration (seconds)
                  <input
                    type="number"
                    min={0}
                    step={1}
                    className="crm-input mt-1"
                    value={durationSec}
                    onChange={(e) => setDurationSec(e.target.value)}
                  />
                </label>
                {(selectedDispositionConfig.fields ?? []).map((field) => {
                  const key = field.key?.trim();
                  if (!key) return null;
                  const value = customFieldValues[key] ?? "";
                  const inputType =
                    field.type === "datetime"
                      ? "datetime-local"
                      : field.type === "number"
                        ? "number"
                        : "text";
                  return (
                    <label key={field.id || key} className="text-sm font-medium text-crm-text">
                      {field.label} {field.required ? <span className="text-red-600">*</span> : null}
                      {field.type === "select" ? (
                        <select
                          className="crm-input mt-1"
                          value={value}
                          onChange={(e) =>
                            setCustomFieldValues((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                        >
                          <option value="">Select {field.label}</option>
                          {(field.options ?? []).map((option) => (
                            <option key={option} value={option}>
                              {option}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          type={inputType}
                          className="crm-input mt-1"
                          value={value}
                          onChange={(e) =>
                            setCustomFieldValues((prev) => ({ ...prev, [key]: e.target.value }))
                          }
                        />
                      )}
                    </label>
                  );
                })}
                {/* FR-RE rendering moved to <CleanDispositionForm> (Stage 2b):
                    a live form routes to the clean view above, so this legacy
                    branch is only the no-live-form fallback and renders no FR-RE. */}
              </div>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="text-sm font-medium text-crm-text">
                  Follow Up Date and Time {activeStatusRule?.needsDateTime ? <span className="text-red-600">*</span> : null}
                  <input
                    type="datetime-local"
                    className="crm-input mt-1"
                    value={followUpAt}
                    onChange={(e) => setFollowUpAt(e.target.value)}
                  />
                </label>
                <label className="text-sm font-medium text-crm-text">
                  Status <span className="text-red-600">*</span>
                  <select
                    className="crm-input mt-1"
                    value={selectedStatus}
                    onChange={(e) => {
                      setSelectedStatus(e.target.value);
                      setSelectedSubStage("");
                      setSelectedReason("");
                    }}
                  >
                    <option value="">Select status</option>
                    {allowedStatuses.map((status) => (
                      <option key={status} value={status}>
                        {status}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-crm-text">
                  Lead Stage
                  <input
                    className="crm-input mt-1 bg-gray-100"
                    readOnly
                    value={activeStatusRule?.nextStage || leadStage || "New Lead"}
                  />
                </label>
                <label className="text-sm font-medium text-crm-text">
                  Sub Stage <span className="text-red-600">*</span>
                  <select
                    className="crm-input mt-1"
                    value={selectedSubStage}
                    onChange={(e) => setSelectedSubStage(e.target.value)}
                  >
                    <option value="">Select sub stage</option>
                    {(activeStatusRule?.subStages ?? []).map((sub) => (
                      <option key={sub} value={sub}>
                        {sub}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="text-sm font-medium text-crm-text">
                  Reason <span className="text-red-600">*</span>
                  <select
                    className="crm-input mt-1"
                    value={selectedReason}
                    onChange={(e) => setSelectedReason(e.target.value)}
                  >
                    <option value="">Select reason</option>
                    {(activeStatusRule?.reasons ?? []).map((reason) => (
                      <option key={reason} value={reason}>
                        {reason}
                      </option>
                    ))}
                  </select>
                </label>
                {showDemoBlock ? (
                  <>
                    <label className="text-sm font-medium text-crm-text">
                      Demo Scheduled By <span className="text-red-600">*</span>
                      <select
                        className="crm-input mt-1"
                        value={demoScheduledBy}
                        onChange={(e) => setDemoScheduledBy(e.target.value)}
                      >
                        <option value="">Select user</option>
                        {demoScheduledByOptions.map((name) => (
                          <option key={name} value={name}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="text-sm font-medium text-crm-text">
                      Demo Date Time
                      <input
                        type="datetime-local"
                        className="crm-input mt-1"
                        value={demoDateTime}
                        onChange={(e) => setDemoDateTime(e.target.value)}
                      />
                    </label>
                    <label className="text-sm font-medium text-crm-text sm:col-span-2">
                      Demo Scheduled On <span className="text-red-600">*</span>
                      <input
                        type="datetime-local"
                        className="crm-input mt-1"
                        value={demoScheduledOn}
                        onChange={(e) => setDemoScheduledOn(e.target.value)}
                      />
                    </label>
                  </>
                ) : null}
                <label className="text-sm font-medium text-crm-text sm:col-span-2">
                  Notes <span className="text-red-600">*</span>
                  <textarea
                    className="crm-input mt-1 min-h-[72px]"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                  />
                </label>
              </div>
            )}
            {err ? (
              <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </p>
            ) : null}
            <div className="mt-4 flex items-center justify-between border-t border-crm-border pt-3">
              <button
                type="button"
                className="rounded border border-crm-border bg-white px-3 py-1.5 text-sm font-medium text-crm-text hover:bg-crm-panel"
                onClick={() => {
                  if (step === 0) setView("menu");
                  else setStep(0);
                }}
              >
                Previous
              </button>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded px-3 py-1.5 text-sm text-crm-muted hover:bg-crm-panel"
                  onClick={onClose}
                >
                  Cancel
                </button>
                {step === 0 ? (
                  <button
                    type="button"
                    className="rounded bg-crm-blue px-4 py-1.5 text-sm font-medium text-white hover:brightness-110"
                    onClick={() => setStep(1)}
                  >
                    Next
                  </button>
                ) : (
                  <button
                    type="button"
                    className="rounded bg-crm-blue px-4 py-1.5 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
                    disabled={saving}
                    onClick={() => void submitCallDisposition()}
                  >
                    {saving ? "Saving..." : "Save"}
                  </button>
                )}
              </div>
            </div>
          </>
          )
        ) : null}

        {view === "payment" ? (
          <>
            <h2 className="text-base font-semibold text-crm-text">Payment verification</h2>
            <p className="mt-1 text-sm text-crm-muted">Submit payment details.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium text-crm-text">
                Amount
                <input
                  className="crm-input mt-1"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  placeholder="0.00"
                />
              </label>
              <label className="text-sm font-medium text-crm-text">
                Payment mode
                <select
                  className="crm-input mt-1"
                  value={paymentMode}
                  onChange={(e) => setPaymentMode(e.target.value)}
                >
                  <option>UPI</option>
                  <option>Card</option>
                  <option>Bank Transfer</option>
                  <option>Cash</option>
                </select>
              </label>
              <label className="text-sm font-medium text-crm-text sm:col-span-2">
                Reference / transaction ID
                <input
                  className="crm-input mt-1"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                />
              </label>
              <label className="text-sm font-medium text-crm-text sm:col-span-2">
                Notes
                <textarea
                  className="crm-input mt-1 min-h-[72px]"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                />
              </label>
            </div>
            {err ? (
              <p className="mt-3 rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {err}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                className="rounded border border-crm-border bg-white px-4 py-2 text-sm font-medium text-crm-text hover:bg-crm-panel"
                onClick={() => setView("menu")}
                disabled={savingPayment}
              >
                Back
              </button>
              <button
                type="button"
                className="rounded bg-crm-blue px-4 py-2 text-sm font-medium text-white hover:brightness-110 disabled:opacity-50"
                disabled={savingPayment}
                onClick={() => void submitPaymentVerification()}
              >
                {savingPayment ? "Submitting..." : "Save"}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
