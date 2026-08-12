"use client";

/**
 * FR-RE Slice 1 (a) — admin form-builder for the call-disposition form.
 *
 * Minimal spine: open the default call_disposition set (create one if none),
 * edit its DRAFT version (add fields), and Publish once. Everything is built on
 * the draft; a published-only set is shown read-only (clone-on-edit is Slice 2).
 * Built on the settings CRUD pattern + the field-editor-modal pattern, all on
 * @/components/ui/.
 */
import { useCallback, useEffect, useState } from "react";
import { Plus, Lock, Lightbulb, Pencil, Trash2 } from "lucide-react";
import { SettingsReturnBackButton } from "@/components/settings/settings-return-back";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { DispositionRuleBuilder } from "@/components/settings/disposition-rule-builder";

interface VersionRef {
  id: string;
  versionNumber: number;
  status: "draft" | "published" | "retired";
  publishedAt: string | null;
}
interface FormSet {
  id: string;
  name: string;
  isDefault: boolean;
  versions: VersionRef[];
}
interface FieldOption {
  valueKey: string;
  label: string;
}
interface RuntimeField {
  id: string;
  fieldKey: string;
  label: string;
  fieldType: string;
  isProtected: boolean;
  requiredLevel: string;
  formTabId: string | null;
  defaultVisibility: string;
  options: FieldOption[];
}
interface RuntimeTab {
  id: string;
  name: string;
  visibility: string;
  sortOrder: number;
  isProtected: boolean;
}
interface Runtime {
  versionId: string;
  tabs: RuntimeTab[];
  fields: RuntimeField[];
}

const FIELD_TYPES = ["dropdown", "text", "number", "datetime", "user_picker"] as const;

async function apiGet<T>(url: string): Promise<T> {
  const res = await fetch(url, { credentials: "include" });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}
async function apiMutate<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    credentials: "include",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error ?? "Request failed");
  return json.data as T;
}
function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9_]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 60);
}

export function DispositionFormBuilder() {
  const toast = useToast();
  const [loaded, setLoaded] = useState(false);
  const [activeSet, setActiveSet] = useState<FormSet | null>(null);
  const [draftVersionId, setDraftVersionId] = useState<string | null>(null); // null => published-only or no set
  const [displayVersion, setDisplayVersion] = useState<VersionRef | null>(null);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [creating, setCreating] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [cloning, setCloning] = useState(false);

  // add-field modal
  const [fieldOpen, setFieldOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [fieldKey, setFieldKey] = useState("");
  const [keyTouched, setKeyTouched] = useState(false);
  const [fieldType, setFieldType] = useState<string>("dropdown");
  const [optionsText, setOptionsText] = useState("");
  // user_picker per-type config (matches UserPickerScope / UserPickerMode).
  const [userPickerScope, setUserPickerScope] = useState<"all_users" | "team" | "role">("team");
  const [userPickerMode, setUserPickerMode] = useState<"single" | "multi">("single");
  const [fieldTabId, setFieldTabId] = useState<string>(""); // which tab the field lands on
  const [fieldHidden, setFieldHidden] = useState(false); // defaultVisibility hidden (rule-revealed)
  const [savingField, setSavingField] = useState(false);

  // add-tab modal
  const [tabOpen, setTabOpen] = useState(false);
  const [tabName, setTabName] = useState("");
  const [tabHidden, setTabHidden] = useState(true); // rule-driven by default (the show_tab use case)
  const [savingTab, setSavingTab] = useState(false);

  // edit-field modal (label + required-level only; options-editing is deferred)
  const [editTarget, setEditTarget] = useState<RuntimeField | null>(null);
  const [editLabel, setEditLabel] = useState("");
  const [editRequired, setEditRequired] = useState<string>("soft");
  const [savingEdit, setSavingEdit] = useState(false);
  // delete-confirm
  const [deleteTarget, setDeleteTarget] = useState<RuntimeField | null>(null);
  const [deletingField, setDeletingField] = useState(false);

  const load = useCallback(async () => {
    try {
      const sets = await apiGet<FormSet[]>("/api/forms/sets");
      const def = sets.find((s) => s.isDefault) ?? sets[0] ?? null;
      setActiveSet(def);

      if (!def) {
        setDraftVersionId(null);
        setDisplayVersion(null);
        setRuntime(null);
        setLoaded(true);
        return;
      }
      const draft = def.versions.find((v) => v.status === "draft") ?? null;
      const published = def.versions.find((v) => v.status === "published") ?? null;
      const display = draft ?? published ?? null;
      setDraftVersionId(draft?.id ?? null);
      setDisplayVersion(display);
      if (display) {
        setRuntime(await apiGet<Runtime>(`/api/forms/versions/${display.id}/runtime`));
      } else {
        setRuntime(null);
      }
      setLoaded(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load");
      setLoaded(true);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createForm() {
    setCreating(true);
    try {
      await apiMutate("POST", "/api/forms/sets", { name: "Call Disposition Form" });
      toast.success("Form created");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  function openAddField() {
    setLabel("");
    setFieldKey("");
    setKeyTouched(false);
    setFieldType("dropdown");
    setOptionsText("");
    setUserPickerScope("team");
    setUserPickerMode("single");
    setFieldTabId(""); // default: unassigned (renders flat in the agent form)
    setFieldHidden(false);
    setFieldOpen(true);
  }

  async function saveField() {
    if (!draftVersionId) return;
    const finalKey = (keyTouched ? fieldKey : slugify(label)).trim();
    if (!label.trim() || !finalKey) {
      toast.error("Label and key are required.");
      return;
    }
    const options =
      fieldType === "dropdown"
        ? optionsText
            .split("\n")
            .map((l) => l.trim())
            .filter(Boolean)
            .map((l) => ({ valueKey: slugify(l), label: l }))
        : undefined;
    if (fieldType === "dropdown" && (!options || options.length === 0)) {
      toast.error("Add at least one option.");
      return;
    }
    setSavingField(true);
    try {
      await apiMutate("POST", `/api/forms/versions/${draftVersionId}/fields`, {
        fieldKey: finalKey,
        label: label.trim(),
        fieldType,
        sortOrder: (runtime?.fields.length ?? 0) + 1,
        formTabId: fieldTabId || null,
        defaultVisibility: fieldHidden ? "hidden" : "visible",
        options,
        ...(fieldType === "user_picker"
          ? { userPickerScope, userPickerMode }
          : {}),
      });
      toast.success("Field added");
      setFieldOpen(false);
      setRuntime(await apiGet<Runtime>(`/api/forms/versions/${draftVersionId}/runtime`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSavingField(false);
    }
  }

  async function createTab() {
    if (!draftVersionId) return;
    if (!tabName.trim()) {
      toast.error("Tab name is required.");
      return;
    }
    setSavingTab(true);
    try {
      await apiMutate("POST", `/api/forms/versions/${draftVersionId}/tabs`, {
        name: tabName.trim(),
        visibility: tabHidden ? "rule_driven" : "always",
        sortOrder: (runtime?.tabs.length ?? 0) + 1,
      });
      toast.success("Tab added");
      setTabOpen(false);
      setTabName("");
      setTabHidden(true);
      setRuntime(await apiGet<Runtime>(`/api/forms/versions/${draftVersionId}/runtime`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not add tab");
    } finally {
      setSavingTab(false);
    }
  }

  function openEdit(f: RuntimeField) {
    setEditTarget(f);
    setEditLabel(f.label);
    setEditRequired(f.requiredLevel);
  }

  async function saveEdit() {
    if (!editTarget) return;
    if (!editLabel.trim()) {
      toast.error("Label is required.");
      return;
    }
    setSavingEdit(true);
    try {
      await apiMutate("PATCH", `/api/forms/fields/${editTarget.id}`, {
        label: editLabel.trim(),
        requiredLevel: editRequired,
      });
      toast.success("Field updated");
      setEditTarget(null);
      if (draftVersionId) setRuntime(await apiGet<Runtime>(`/api/forms/versions/${draftVersionId}/runtime`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteField() {
    if (!deleteTarget) return;
    setDeletingField(true);
    try {
      await apiMutate("DELETE", `/api/forms/fields/${deleteTarget.id}`);
      toast.success("Field deleted");
      setDeleteTarget(null);
      if (draftVersionId) setRuntime(await apiGet<Runtime>(`/api/forms/versions/${draftVersionId}/runtime`));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeletingField(false);
    }
  }

  // Clone-on-edit: editing a published form clones it to a fresh draft (Unit 7).
  async function editPublished() {
    if (!displayVersion) return;
    setCloning(true);
    try {
      await apiMutate("POST", `/api/forms/versions/${displayVersion.id}/clone`);
      toast.success("Editable draft created");
      await load(); // re-resolves: the set now has a draft -> editable mode
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not start editing");
    } finally {
      setCloning(false);
    }
  }

  async function publish() {
    if (!draftVersionId) return;
    setPublishing(true);
    try {
      await apiMutate("POST", `/api/forms/versions/${draftVersionId}/publish`);
      toast.success("Form published");
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Publish failed");
    } finally {
      setPublishing(false);
    }
  }

  const editable = !!draftVersionId;
  const fields = runtime?.fields ?? [];
  const tabs = [...(runtime?.tabs ?? [])].sort((a, b) => a.sortOrder - b.sortOrder);
  const unassignedFields = fields.filter((f) => !f.formTabId);

  function fieldRow(f: RuntimeField) {
    return (
      <li key={f.id} className="flex items-center justify-between px-4 py-2.5">
        <div>
          <span className="text-sm font-medium text-crm-text">{f.label}</span>
          <span className="ml-2 text-xs text-crm-muted">
            {f.fieldKey} · {f.fieldType}
            {f.requiredLevel === "hard" ? " · required" : ""}
            {f.defaultVisibility === "hidden" ? " · hidden" : ""}
            {f.options.length ? ` · ${f.options.length} options` : ""}
          </span>
        </div>
        {f.isProtected ? (
          <span className="inline-flex items-center gap-1 text-[11px] text-crm-muted">
            <Lock className="h-3 w-3" /> protected
          </span>
        ) : editable ? (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => openEdit(f)}
              aria-label={`Edit ${f.label}`}
              className="rounded p-1 text-crm-muted transition hover:bg-crm-panel hover:text-crm-text"
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setDeleteTarget(f)}
              aria-label={`Delete ${f.label}`}
              className="rounded p-1 text-crm-muted transition hover:bg-crm-panel hover:text-red-600"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ) : null}
      </li>
    );
  }

  return (
    <div className="space-y-5">
      <SettingsReturnBackButton />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-crm-text">Disposition Forms</h1>
          <p className="text-sm text-crm-muted">
            Build the custom fields agents fill when logging a call disposition.
          </p>
        </div>
        {editable && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setTabOpen(true)}>
              <Plus className="mr-1 h-4 w-4" /> Add tab
            </Button>
            <Button variant="secondary" onClick={openAddField}>
              <Plus className="mr-1 h-4 w-4" /> Add field
            </Button>
            <Button onClick={publish} disabled={publishing}>
              {publishing ? "Publishing…" : "Publish"}
            </Button>
          </div>
        )}
      </div>

      {!loaded ? (
        <div className="crm-card p-6 text-sm text-crm-muted">Loading…</div>
      ) : !activeSet ? (
        <div className="crm-card flex flex-col items-center gap-3 p-10 text-center">
          <p className="text-sm text-crm-muted">No disposition form yet.</p>
          <Button onClick={createForm} disabled={creating}>
            {creating ? "Creating…" : "New form"}
          </Button>
        </div>
      ) : (
        <div className="crm-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-crm-border px-4 py-3">
            <span className="font-medium text-crm-text">{activeSet.name}</span>
            <span className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs text-crm-muted">
              {editable ? (
                `Draft · v${displayVersion?.versionNumber ?? 1}`
              ) : (
                <>
                  <Lock className="h-3 w-3" /> Published · v{displayVersion?.versionNumber ?? 1}
                </>
              )}
            </span>
          </div>

          {!editable && (
            <div className="flex items-center justify-between gap-3 bg-crm-panel px-4 py-2.5">
              <span className="flex items-start gap-2 text-xs text-crm-muted">
                <Lightbulb className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                This form is published (read-only). Edit it to create a new draft, then republish.
              </span>
              <Button variant="secondary" onClick={editPublished} disabled={cloning}>
                <Pencil className="mr-1 h-4 w-4" /> {cloning ? "Preparing…" : "Edit form"}
              </Button>
            </div>
          )}

          {fields.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-crm-muted">No fields yet.</p>
          ) : (
            <div className="divide-y divide-crm-border">
              {tabs.map((tab) => {
                const tabFields = fields.filter((f) => f.formTabId === tab.id);
                return (
                  <div key={tab.id}>
                    <div className="flex items-center gap-2 bg-crm-panel/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-crm-muted">
                      {tab.name}
                      {tab.visibility === "rule_driven" && (
                        <span className="inline-flex items-center gap-1 rounded bg-accent-100 px-1.5 py-0.5 text-[10px] font-medium normal-case text-accent-800">
                          <Lightbulb className="h-3 w-3" /> rule-driven
                        </span>
                      )}
                    </div>
                    <ul className="divide-y divide-crm-border">
                      {tabFields.length === 0 ? (
                        <li className="px-4 py-2.5 text-xs text-crm-muted">No fields on this tab.</li>
                      ) : (
                        tabFields.map(fieldRow)
                      )}
                    </ul>
                  </div>
                );
              })}
              {unassignedFields.length > 0 && (
                <div>
                  <div className="bg-crm-panel/60 px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-crm-muted">
                    Unassigned
                  </div>
                  <ul className="divide-y divide-crm-border">{unassignedFields.map(fieldRow)}</ul>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {editable && draftVersionId && (
        <DispositionRuleBuilder versionId={draftVersionId} fields={fields} tabs={tabs} />
      )}

      <Modal open={fieldOpen} onClose={() => setFieldOpen(false)} title="New field" width="max-w-lg">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <FieldLabel label="Label *" full>
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Payment Mode"
            />
          </FieldLabel>
          <FieldLabel label="Key *" full>
            <Input
              value={keyTouched ? fieldKey : slugify(label)}
              onChange={(e) => {
                setFieldKey(e.target.value);
                setKeyTouched(true);
              }}
              placeholder="payment_mode"
            />
          </FieldLabel>
          <FieldLabel label="Type">
            <Select value={fieldType} onChange={(e) => setFieldType(e.target.value)}>
              {FIELD_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </FieldLabel>
          <FieldLabel label="Tab">
            <Select value={fieldTabId} onChange={(e) => setFieldTabId(e.target.value)}>
              <option value="">Unassigned</option>
              {tabs.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                  {t.visibility === "rule_driven" ? " (rule-driven)" : ""}
                </option>
              ))}
            </Select>
          </FieldLabel>
          {fieldType === "dropdown" && (
            <FieldLabel label="Options (one per line) *" full>
              <textarea
                className="crm-input min-h-[90px]"
                value={optionsText}
                onChange={(e) => setOptionsText(e.target.value)}
                placeholder={"UPI\nInvoice"}
              />
            </FieldLabel>
          )}
          {fieldType === "user_picker" && (
            <>
              <FieldLabel label="User scope">
                <Select
                  value={userPickerScope}
                  onChange={(e) => setUserPickerScope(e.target.value as "all_users" | "team" | "role")}
                >
                  <option value="all_users">All users</option>
                  <option value="team">Team (sales-group co-members)</option>
                  <option value="role">Role</option>
                </Select>
              </FieldLabel>
              <FieldLabel label="Selection">
                <Select
                  value={userPickerMode}
                  onChange={(e) => setUserPickerMode(e.target.value as "single" | "multi")}
                >
                  <option value="single">Single</option>
                  <option value="multi">Multiple</option>
                </Select>
              </FieldLabel>
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-crm-text md:col-span-full">
            <input type="checkbox" checked={fieldHidden} onChange={(e) => setFieldHidden(e.target.checked)} />
            Hidden until a rule reveals it
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setFieldOpen(false)}>
            Cancel
          </Button>
          <Button onClick={saveField} disabled={savingField}>
            {savingField ? "Saving…" : "Add field"}
          </Button>
        </div>
      </Modal>

      <Modal open={tabOpen} onClose={() => setTabOpen(false)} title="New tab" width="max-w-md">
        <div className="space-y-4">
          <FieldLabel label="Tab name *">
            <Input value={tabName} onChange={(e) => setTabName(e.target.value)} placeholder="e.g. Payment Details" />
          </FieldLabel>
          <label className="flex items-center gap-2 text-sm text-crm-text">
            <input type="checkbox" checked={tabHidden} onChange={(e) => setTabHidden(e.target.checked)} />
            Hidden until a rule shows it (rule-driven)
          </label>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setTabOpen(false)}>
            Cancel
          </Button>
          <Button onClick={createTab} disabled={savingTab}>
            {savingTab ? "Adding…" : "Add tab"}
          </Button>
        </div>
      </Modal>

      <Modal open={!!editTarget} onClose={() => setEditTarget(null)} title="Edit field" width="max-w-lg">
        <div className="space-y-4">
          <FieldLabel label="Label *">
            <Input value={editLabel} onChange={(e) => setEditLabel(e.target.value)} />
          </FieldLabel>
          <FieldLabel label="Requirement">
            <Select value={editRequired} onChange={(e) => setEditRequired(e.target.value)}>
              <option value="none">None</option>
              <option value="soft">Soft (warn)</option>
              <option value="hard">Hard (required)</option>
            </Select>
          </FieldLabel>
          <p className="text-[11px] text-crm-muted">
            Key, type, and options can&apos;t be changed here (options-editing is coming later).
          </p>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setEditTarget(null)}>
            Cancel
          </Button>
          <Button onClick={saveEdit} disabled={savingEdit}>
            {savingEdit ? "Saving…" : "Save changes"}
          </Button>
        </div>
      </Modal>

      <Modal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} title="Delete field" width="max-w-md">
        <p className="text-sm text-crm-text">
          Delete <span className="font-medium">{deleteTarget?.label}</span> from this draft? This
          can&apos;t be undone.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="secondary" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={deleteField} disabled={deletingField}>
            {deletingField ? "Deleting…" : "Delete"}
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function FieldLabel({ label, full, children }: { label: string; full?: boolean; children: React.ReactNode }) {
  return (
    <label className={"block text-sm " + (full ? "md:col-span-full" : "")}>
      <span className="mb-1 block font-medium text-crm-text">{label}</span>
      {children}
    </label>
  );
}
