"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Drawer } from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export interface QuickEditLead {
  id: string;
  status: string;
  stage: string;
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
  onPatch: (patch: Partial<QuickEditLead> & { tags?: string }) => void;
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

  const [form, setForm] = useState({
    status: lead.status,
    stage: lead.stage,
    ownerId: lead.ownerId ?? "",
    followupPriority: lead.followupPriority ?? "",
    phone: lead.phone ?? "",
    email: lead.email ?? "",
    website: lead.website ?? "",
    source: lead.source ?? "",
    tags: getTags(lead.dynamicFields),
  });

  useEffect(() => {
    if (!open) return;
    const next = {
      status: lead.status,
      stage: lead.stage,
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
  }, [open, lead]);

  const markDirty = useCallback((patch: Partial<typeof form>) => {
    setForm((f) => {
      const n = { ...f, ...patch };
      setDirty(JSON.stringify(n) !== initialRef.current);
      return n;
    });
  }, []);

  const save = useCallback(async () => {
    if (!canEdit) return;
    setSaving(true);
    const tagList = form.tags
      .split(",")
      .map((t) => t.trim())
      .filter(Boolean);
    const body: Record<string, unknown> = {
      status: form.status,
      stage: form.stage,
      ownerId: form.ownerId || null,
      followupPriority: form.followupPriority || null,
      phone: form.phone || null,
      email: form.email || null,
      website: form.website || null,
      source: form.source || null,
      dynamicFields: {
        ...(lead.dynamicFields ?? {}),
        tags: tagList,
      },
    };
    onPatch({
      status: form.status,
      stage: form.stage,
      ownerId: form.ownerId || null,
      ownerName: owners.find((o) => o.id === form.ownerId)?.name ?? lead.ownerName,
      followupPriority: form.followupPriority || null,
      phone: form.phone || null,
      email: form.email || null,
      website: form.website || null,
      source: form.source || null,
      tags: form.tags,
    });
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error ?? "Save failed");
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
  }, [canEdit, form, lead, onClose, onPatch, owners, router, toast]);

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
        <Field label="Status">
          <Select
            value={form.status}
            onChange={(e) => markDirty({ status: e.target.value })}
            disabled={!canEdit}
          >
            {pipelineStatuses.map((s) => (
              <option key={s} value={s}>
                {s}
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
            {pipelineStages.map((s) => (
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
        <Field label="Lead source">
          <Input
            value={form.source}
            onChange={(e) => markDirty({ source: e.target.value })}
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
