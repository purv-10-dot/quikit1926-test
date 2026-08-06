"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Pencil, Plus } from "lucide-react";
import { SCREEN_FIELDS, customFieldKey } from "@/lib/services/screens/field-registry";
import { PortalDropdown } from "../../workflows/[wfId]/_components/flow/portal-dropdown";
import { ScreenFieldList } from "./screen-field-list";

interface ScreenDetail {
  id: string;
  name: string;
  description: string | null;
  isDefault: boolean;
  tabs: { id: string; name: string; fieldKeys: string[] }[];
}
interface Tab { name: string; fieldKeys: string[] }
interface FieldOpt { key: string; label: string }

const QKEY = (id: string) => ["quiktrack", "screen", id];

async function fetchScreen(screenId: string): Promise<ScreenDetail> {
  const r = await fetch(`/api/screens/${screenId}`);
  const j = await r.json();
  if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to load");
  return j.data as ScreenDetail;
}

/** Active custom fields for this space → namespaced screen field options. */
async function fetchCustomFields(projectId: string): Promise<FieldOpt[]> {
  const r = await fetch(`/api/projects/${projectId}/custom-fields`);
  const j = await r.json();
  if (!r.ok || !j.success) return [];
  return (j.data as { key: string; name: string }[]).map((f) => ({
    key: customFieldKey(f.key),
    label: f.name,
  }));
}

/** Configure Screen — tabs + ordered fields, matching Jira's screen editor. */
export function ConfigureScreen({ projectId, screenId }: { projectId: string; screenId: string }) {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({ queryKey: QKEY(screenId), queryFn: () => fetchScreen(screenId) });
  const customFields = useQuery({
    queryKey: ["quiktrack", "custom-fields", projectId],
    queryFn: () => fetchCustomFields(projectId),
  });

  const [name, setName] = useState("");
  const [tabs, setTabs] = useState<Tab[]>([]);
  const [activeTab, setActiveTab] = useState(0);
  const [renamingTab, setRenamingTab] = useState(false);
  const [tabDraft, setTabDraft] = useState("");
  const [addingTab, setAddingTab] = useState(false);
  const [newTab, setNewTab] = useState("");

  useEffect(() => {
    if (!data) return;
    setName(data.name);
    setTabs(data.tabs.length ? data.tabs.map((t) => ({ name: t.name, fieldKeys: t.fieldKeys })) : [{ name: "Field Tab", fieldKeys: [] }]);
  }, [data]);

  const save = useMutation({
    mutationFn: async (next: Tab[]) => {
      const r = await fetch(`/api/screens/${screenId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tabs: next }),
      });
      const j = await r.json();
      if (!r.ok || !j.success) throw new Error(j.error ?? "Failed to save");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: QKEY(screenId) }),
  });

  /** Apply a tab-list change locally and persist it. */
  const commit = (next: Tab[]) => { setTabs(next); save.mutate(next); };

  // All selectable fields: built-ins + this space's active custom fields.
  const allFields: FieldOpt[] = useMemo(
    () => [...SCREEN_FIELDS.map((f) => ({ key: f.key, label: f.label })), ...(customFields.data ?? [])],
    [customFields.data],
  );
  const labelOf = (key: string) => allFields.find((f) => f.key === key)?.label ?? key;

  const tab = tabs[activeTab];
  const usedKeys = new Set(tabs.flatMap((t) => t.fieldKeys));
  const available = allFields.filter((f) => !usedKeys.has(f.key));

  const setTabFields = (fieldKeys: string[]) =>
    commit(tabs.map((t, i) => (i === activeTab ? { ...t, fieldKeys } : t)));

  if (isLoading) {
    return <div className="flex items-center gap-2 px-8 py-10 text-sm text-gray-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (error) return <div className="px-8 py-10 text-sm text-red-600">{(error as Error).message}</div>;

  return (
    <div className="mx-auto max-w-5xl px-8 py-8">
      <Link href={`/spaces/${projectId}/settings/screens`} className="inline-flex items-center gap-1.5 text-sm font-medium text-gray-600 hover:text-gray-800">
        <ArrowLeft className="h-4 w-4" /> Screens
      </Link>

      <h1 className="mt-4 text-xl font-semibold text-gray-900">Configure Screen</h1>
      <p className="mt-1 text-sm text-gray-600">
        These are the fields and their order for work items using <span className="font-medium">{name}</span>.
      </p>

      {/* Tab strip */}
      <div className="mt-5 flex items-center gap-2 border-b border-gray-200">
        {tabs.map((t, i) => (
          <button
            key={i}
            type="button"
            onClick={() => { setActiveTab(i); setRenamingTab(false); }}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm ${
              i === activeTab ? "border-accent-600 font-medium text-accent-700" : "border-transparent text-gray-600 hover:text-gray-800"
            }`}
          >
            {i === activeTab && renamingTab ? null : t.name}
            {i === activeTab && !renamingTab && (
              <Pencil
                className="h-3 w-3 cursor-pointer text-gray-400 hover:text-gray-700"
                onClick={(e) => { e.stopPropagation(); setTabDraft(t.name); setRenamingTab(true); }}
              />
            )}
          </button>
        ))}
        {renamingTab && (
          <span className="flex items-center gap-2 py-1.5">
            <input
              autoFocus
              value={tabDraft}
              onChange={(e) => setTabDraft(e.target.value)}
              className="w-40 rounded border border-accent-500 px-2 py-1 text-sm focus:outline-none"
            />
            <button type="button" onClick={() => { commit(tabs.map((t, i) => i === activeTab ? { ...t, name: tabDraft.trim() || t.name } : t)); setRenamingTab(false); }} className="text-sm font-medium text-accent-700">OK</button>
            <button type="button" onClick={() => setRenamingTab(false)} className="text-sm text-gray-500">Cancel</button>
          </span>
        )}
        {addingTab ? (
          <span className="flex items-center gap-2 py-1.5">
            <input autoFocus value={newTab} onChange={(e) => setNewTab(e.target.value)} placeholder="Enter tab name" className="w-40 rounded border border-accent-500 px-2 py-1 text-sm focus:outline-none" />
            <button
              type="button"
              disabled={!newTab.trim()}
              onClick={() => { commit([...tabs, { name: newTab.trim(), fieldKeys: [] }]); setActiveTab(tabs.length); setNewTab(""); setAddingTab(false); }}
              className="rounded bg-gray-100 px-2 py-1 text-sm font-medium text-gray-700 disabled:opacity-50"
            >Add</button>
            <button type="button" onClick={() => { setNewTab(""); setAddingTab(false); }} className="text-sm text-gray-500">Cancel</button>
          </span>
        ) : (
          <button type="button" onClick={() => setAddingTab(true)} className="ml-1 inline-flex items-center gap-1 px-2 py-2 text-sm font-medium text-accent-700 hover:underline">
            <Plus className="h-3.5 w-3.5" /> Add Tab
          </button>
        )}
      </div>

      {/* Field list for the active tab */}
      {tab && (
        <ScreenFieldList
          fieldKeys={tab.fieldKeys}
          onChange={setTabFields}
          labelOf={labelOf}
        />
      )}

      {/* Add a field */}
      <div className="mt-4 flex items-center gap-3">
        <div className="w-56">
          <PortalDropdown
            placeholder="Select Field …"
            options={available.map((f) => ({ value: f.key, label: f.label }))}
            selected={[]}
            onChange={(next) => {
              const key = next[0];
              if (key && tab) setTabFields([...tab.fieldKeys, key]);
            }}
          />
        </div>
        <span className="text-xs text-gray-500">Select a field to add it to the screen.</span>
        {save.isPending && <span className="ml-auto inline-flex items-center gap-1 text-xs text-gray-400"><Loader2 className="h-3 w-3 animate-spin" /> Saving…</span>}
      </div>
    </div>
  );
}
