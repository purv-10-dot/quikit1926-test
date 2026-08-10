"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import {
  fetchPipelineConfig,
  fetchSources,
  invalidatePipelineConfigCache,
  invalidateSourcesCache,
  type PipelineConfig,
  type SourceOption,
} from "@/lib/cache/lead-form-lookups";

export interface QuickEditLead {
  id: string;
  status: string;
  stage: string;
  substatus: string | null;
  ownerId: string | null;
  ownerName: string | null;
  followupPriority: string | null;
  phone: string | null;
  email: string | null;
  website: string | null;
  source: string | null;
  dynamicFields?: Record<string, unknown> | null;
}

function getTags(df: Record<string, unknown> | null | undefined): string {
  const t = df?.tags;
  if (Array.isArray(t)) return t.join(", ");
  if (typeof t === "string") return t;
  return "";
}

interface Props {
  open: boolean;
  onClose: () => void;
  lead: QuickEditLead;
  pipelineStages: string[];
  pipelineStatuses: string[];
  owners: { id: string; name: string }[];
  canEdit: boolean;
  /**
   * Called on a successful save with the AUTHORITATIVE server lead record
   * (normalized phone/mobile included), so the parent replaces its local state
   * with the server's truth rather than the raw typed value. The server shape is
   * broader than QuickEditLead; we accept the fields the shell merges.
   */
  onPatch: (serverLead: Partial<QuickEditLead> & { mobile?: string | null }) => void;
}

export function QuickEditDrawer({
  open,
  onClose,
  lead,
  pipelineStages,
  pipelineStatuses,
  owners,
  canEdit,
  onPatch,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const initialRef = useRef("");

  // Pipeline config + sources are fetched client-side (like lead-form.tsx) rather
  // than threaded through the server page, because the dashboard page only passes
  // flat stage/status arrays — no dependentRules. This drawer owns its own
  // dependent-filtering data so Source→Stage→Status→Substatus can cascade.
  const [pipeline, setPipeline] = useState<PipelineConfig>({
    stages: pipelineStages,
    statuses: pipelineStatuses,
    substatuses: [],
    dependentRules: {},
  });
  const [sources, setSources] = useState<SourceOption[]>([]);

  const [form, setForm] = useState({
    status: lead.status,
    stage: lead.stage,
    substatus: lead.substatus ?? "",
    ownerId: lead.ownerId ?? "",
    followupPriority: lead.followupPriority ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    website: lead.website ?? "",
    source: lead.source ?? "",
    tags: getTags(lead.dynamicFields),
  });

  // Seed form from the lead each time the drawer opens, and (re)load config +
  // sources with a cache bust so Settings changes since last open are reflected.
  useEffect(() => {
    if (!open) return;
    const next = {
      status: lead.status,
      stage: lead.stage,
      substatus: lead.substatus ?? "",
      ownerId: lead.ownerId ?? "",
      followupPriority: lead.followupPriority ?? "",
      phone: lead.phone ?? "",
      email: lead.email ?? "",
      website: lead.website ?? "",
      source: lead.source ?? "",
      tags: getTags(lead.dynamicFields),
    };
    setForm(next);
    initialRef.current = JSON.stringify(next);
    setDirty(false);

    invalidatePipelineConfigCache();
    void fetchPipelineConfig().then((cfg) => {
      setPipeline({
        stages: cfg?.stages?.length ? cfg.stages : pipelineStages,
        statuses: cfg?.statuses?.length ? cfg.statuses : pipelineStatuses,
        substatuses: Array.isArray(cfg?.substatuses) ? cfg.substatuses : [],
        dependentRules: cfg?.dependentRules ?? {},
      });
    });

    invalidateSourcesCache();
    void fetchSources().then((list) => setSources(list));
  }, [open, lead, pipelineStages, pipelineStatuses]);

  const markDirty = useCallback((patch: Partial<typeof form>) => {
    setForm((f) => {
      const n = { ...f, ...patch };
      setDirty(JSON.stringify(n) !== initialRef.current);
      return n;
    });
  }, []);

  // Dependent rules — mirror lead-form.tsx exactly: filter stages by source,
  // statuses by stage, substatuses by status. Empty/absent rule → show all.
  const visibleStages = useMemo(() => {
    const allowed = form.source
      ? pipeline.dependentRules.sourceToStages?.[form.source]
      : undefined;
    return allowed && allowed.length > 0
      ? pipeline.stages.filter((s) => allowed.includes(s))
      : pipeline.stages;
  }, [pipeline, form.source]);

  const visibleStatuses = useMemo(() => {
    const allowed = form.stage
      ? pipeline.dependentRules.stageToStatuses?.[form.stage]
      : undefined;
    return allowed && allowed.length > 0
      ? pipeline.statuses.filter((s) => allowed.includes(s))
      : pipeline.statuses;
  }, [pipeline, form.stage]);

  const visibleSubstatuses = useMemo(() => {
    const allowed = form.status
      ? pipeline.dependentRules.statusToSubstatuses?.[form.status]
      : undefined;
    return allowed && allowed.length > 0
      ? pipeline.substatuses.filter((s) => allowed.includes(s))
      : pipeline.substatuses;
  }, [pipeline, form.status]);

  // Auto-reset a child when it falls outside its parent's allowed set — match the
  // main form: stage/status snap to the first allowed value, substatus clears.
  // Guarded on `open` so seeding a freshly-opened drawer (which may briefly hold
  // a value the rules will narrow) doesn't fight the seed on the same tick.
  useEffect(() => {
    if (!open) return;
    if (visibleStages.length > 0 && !visibleStages.includes(form.stage)) {
      markDirty({ stage: visibleStages[0]! });
    }
  }, [open, visibleStages, form.stage, markDirty]);

  useEffect(() => {
    if (!open) return;
    if (visibleStatuses.length > 0 && !visibleStatuses.includes(form.status)) {
      markDirty({ status: visibleStatuses[0]! });
    }
  }, [open, visibleStatuses, form.status, markDirty]);

  useEffect(() => {
    if (!open) return;
    if (form.substatus && visibleSubstatuses.length > 0 && !visibleSubstatuses.includes(form.substatus)) {
      markDirty({ substatus: "" });
    }
  }, [open, visibleSubstatuses, form.substatus, markDirty]);

  const save = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    // Diff current form against the snapshot taken on open (initialRef): send
    // ONLY changed fields. Sending the whole form would null untouched required
    // fields (e.g. an empty "source" → null → 400).
    const initial = JSON.parse(initialRef.current || "{}") as typeof form;

    const stageChanged = form.stage !== initial.stage;
    const statusChanged = form.status !== initial.status;
    const substatusChanged = form.substatus !== initial.substatus;

    // PATCH body: non-pipeline fields, always. Status/substatus go here too UNLESS
    // the stage also changed (then they ride the transition call so the cascade
    // validates them together and they're written atomically).
    const patchBody: Record<string, unknown> = {};
    if (form.ownerId !== initial.ownerId) patchBody.ownerId = form.ownerId || null;
    if (form.followupPriority !== initial.followupPriority)
      patchBody.followupPriority = form.followupPriority || null;
    if (form.phone !== initial.phone) patchBody.phone = form.phone || null;
    if (form.email !== initial.email) patchBody.email = form.email || null;
    if (form.website !== initial.website) patchBody.website = form.website || null;
    if (form.source !== initial.source) patchBody.source = form.source || null;
    if (form.tags !== initial.tags) {
      const tagList = form.tags.split(",").map((t) => t.trim()).filter(Boolean);
      patchBody.dynamicFields = { ...(lead.dynamicFields ?? {}), tags: tagList };
    }

    // Transition body: only when the STAGE actually moves. transitionLead fires
    // the stage-change audit + notifyLeadStageChanged + stage_changed rules — a
    // status-only change must NOT go here (route fires those unconditionally,
    // producing a spurious "stage changed from==to" notification). So:
    //  - stage changed → /transition with { stage, status?, substatus? }
    //  - stage NOT changed, status/substatus changed → those go in PATCH
    const transitionBody: Record<string, unknown> = {};
    if (stageChanged) {
      transitionBody.stage = form.stage;
      if (statusChanged) transitionBody.status = form.status;
      if (substatusChanged) transitionBody.substatus = form.substatus || null;
    } else {
      if (statusChanged) patchBody.status = form.status;
      if (substatusChanged) patchBody.substatus = form.substatus || null;
    }

    const hasTransition = Object.keys(transitionBody).length > 0;
    const hasPatch = Object.keys(patchBody).length > 0;

    if (!hasTransition && !hasPatch) {
      // Nothing actually changed (shouldn't happen — Save is disabled when !dirty).
      setSaving(false);
      return;
    }

    try {
      let merged: Record<string, unknown> = {};

      // Stage moves through /transition first (its side-effects define the lead's
      // authoritative stage/status/substatus). Then non-pipeline fields via PATCH.
      if (hasTransition) {
        const res = await fetch(`/api/leads/${lead.id}/transition`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(transitionBody),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Stage change failed");
        merged = { ...merged, ...j };
      }

      if (hasPatch) {
        const res = await fetch(`/api/leads/${lead.id}`, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(patchBody),
        });
        const j = await res.json();
        if (!res.ok) throw new Error(j.error ?? "Save failed");
        merged = { ...merged, ...j };
      }

      // Hand the authoritative server record(s) up to the parent. When both calls
      // ran, PATCH result is merged last (it's the newest write of non-pipeline
      // fields; the transition already set stage/status/substatus which PATCH
      // didn't touch).
      onPatch(merged);
      toast.success("Lead updated");
      initialRef.current = JSON.stringify(form);
      setDirty(false);
      router.refresh();
      onClose();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }, [canEdit, form, lead, onClose, onPatch, router, toast]);

  function handleClose() {
    if (dirty && !window.confirm("Discard unsaved changes?")) return;
    onClose();
  }

  return (
    <Drawer
      open={open}
      onClose={handleClose}
      title="Quick edit"
      description="Changes save to this lead immediately."
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={handleClose}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={!canEdit || saving || !dirty}>
            {saving ? "Saving…" : "Save"}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <Field label="Lead source">
          <Select
            value={form.source}
            onChange={(e) => markDirty({ source: e.target.value })}
            disabled={!canEdit}
          >
            <option value="">— Select source —</option>
            {sources.map((s) => (
              <option key={s.id} value={s.name}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Stage">
          <Select
            value={form.stage}
            onChange={(e) => markDirty({ stage: e.target.value })}
            disabled={!canEdit}
          >
            {visibleStages.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Status">
          <Select
            value={form.status}
            onChange={(e) => markDirty({ status: e.target.value })}
            disabled={!canEdit}
          >
            {visibleStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Sub status">
          <Select
            value={form.substatus}
            onChange={(e) => markDirty({ substatus: e.target.value })}
            disabled={!canEdit || visibleSubstatuses.length === 0}
          >
            <option value="">— Select sub status —</option>
            {visibleSubstatuses.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Owner">
          <Select
            value={form.ownerId}
            onChange={(e) => markDirty({ ownerId: e.target.value })}
            disabled={!canEdit}
          >
            <option value="">Unassigned</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Priority">
          <Select
            value={form.followupPriority}
            onChange={(e) => markDirty({ followupPriority: e.target.value })}
            disabled={!canEdit}
          >
            <option value="">—</option>
            <option value="Low">Low</option>
            <option value="Medium">Medium</option>
            <option value="High">High</option>
          </Select>
        </Field>
        <Field label="Tags (comma-separated)">
          <Input
            value={form.tags}
            onChange={(e) => markDirty({ tags: e.target.value })}
            disabled={!canEdit}
            placeholder="enterprise, hot, inbound"
          />
        </Field>
        <Field label="Phone">
          <Input
            value={form.phone}
            onChange={(e) => markDirty({ phone: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Email">
          <Input
            value={form.email}
            onChange={(e) => markDirty({ email: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
        <Field label="Website">
          <Input
            value={form.website}
            onChange={(e) => markDirty({ website: e.target.value })}
            disabled={!canEdit}
          />
        </Field>
      </div>
    </Drawer>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-crm-text">{label}</span>
      {children}
    </label>
  );
}
