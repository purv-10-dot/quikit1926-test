"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Copy, Ban, Loader2, ShieldCheck } from "lucide-react";
import { useApiClient } from "@/lib/hooks/use-api";
import { useDialog } from "@/components/hrms/dialog";
import { useToast } from "@/components/hrms/toast";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { PageBackground } from "@/components/hrms/page-background";

interface LauncherApp { id: string; name: string; slug: string }

interface KeyRow {
  id: string;
  label: string;
  keyPrefix: string;
  isActive: boolean;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

export default function DepartmentApiKeysPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [newKey, setNewKey] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["settings", "department-api-keys"],
    queryFn: () => api.get<KeyRow[]>("/api/v1/hrms/settings/integrations/department-api-keys"),
  });
  const keys = data?.data ?? [];

  // Same catalog the in-app AppSwitcher uses — every QuikIT app this org has
  // access to. quikhrms itself doesn't need a key for its own API.
  const { data: appsData } = useQuery({
    queryKey: ["apps-switcher"],
    queryFn: () => api.get<LauncherApp[]>("/api/apps/switcher"),
    enabled: showCreate,
  });
  const apps = (appsData?.data ?? []).filter((a) => a.slug !== "quikhrms");
  const appOptions = [...apps.map((a) => ({ value: a.slug, label: a.name })), { value: "__other__", label: "Other…" }];
  const resolvedLabel = selectedSlug === "__other__" ? customLabel.trim() : (apps.find((a) => a.slug === selectedSlug)?.name ?? "");

  const createMut = useMutation({
    mutationFn: (body: { label: string }) =>
      api.post<{ apiKey: string }>("/api/v1/hrms/settings/integrations/department-api-keys", body),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["settings", "department-api-keys"] });
      setNewKey(res.data.apiKey);
      setSelectedSlug("");
      setCustomLabel("");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not generate key"),
  });

  const revokeMut = useMutation({
    mutationFn: (id: string) => api.post(`/api/v1/hrms/settings/integrations/department-api-keys/${id}/revoke`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "department-api-keys"] });
      toast.success("Key revoked");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not revoke key"),
  });

  const confirmRevoke = async (k: KeyRow) => {
    const okConfirm = await dialog.confirm({
      title: "Revoke this API key?",
      description: `"${k.label}" will stop working immediately. Any app using it (e.g. quikscale) will get an error until a new key is issued.`,
      confirmLabel: "Revoke",
      variant: "danger",
    });
    if (okConfirm) revokeMut.mutate(k.id);
  };

  const closeCreate = () => { setShowCreate(false); setNewKey(null); setSelectedSlug(""); setCustomLabel(""); };

  return (
    <div className="p-4 space-y-4">
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Directory API</h1>
          <p className="text-xs text-gray-500 mt-1">
            Let another QuikIT app (e.g. quikscale) read this org&apos;s Department and Employee directory over a secure, read-only API. One key per integration — generate and revoke anytime, no developer needed.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowCreate(true)}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium shrink-0"
        >
          <Plus size={14} /> Generate API Key
        </button>
      </div>

      <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
        {isLoading ? (
          <div className="p-6 text-center text-xs text-gray-400"><Loader2 size={16} className="animate-spin inline mr-2" />Loading…</div>
        ) : keys.length === 0 ? (
          <div className="p-8 text-center">
            <KeyRound size={22} className="mx-auto text-gray-300 mb-2" />
            <p className="text-xs text-gray-500">No API keys yet. Generate one to let another app read your department and employee directory.</p>
          </div>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-accent-50 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide">
                <th className="px-4 py-2.5">Label</th>
                <th className="px-4 py-2.5">Key</th>
                <th className="px-4 py-2.5">Status</th>
                <th className="px-4 py-2.5">Created</th>
                <th className="px-4 py-2.5">Last Used</th>
                <th className="px-4 py-2.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {keys.map((k) => (
                <tr key={k.id} className="border-t border-gray-100">
                  <td className="px-4 py-2.5 font-medium text-gray-900">{k.label}</td>
                  <td className="px-4 py-2.5 font-mono text-gray-500">{k.keyPrefix}…</td>
                  <td className="px-4 py-2.5">
                    <span className={k.isActive ? "inline-flex items-center gap-1 text-green-700" : "inline-flex items-center gap-1 text-gray-400"}>
                      {k.isActive ? <ShieldCheck size={12} /> : <Ban size={12} />} {k.isActive ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{fmt(k.createdAt)}</td>
                  <td className="px-4 py-2.5 text-gray-500">{fmt(k.lastUsedAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    {k.isActive && (
                      <button
                        type="button"
                        onClick={() => confirmRevoke(k)}
                        disabled={revokeMut.isPending}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
                      >
                        <Ban size={11} /> Revoke
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <Modal open={showCreate} onClose={closeCreate} title="Generate API Key" size="sm">
        {newKey ? (
          <div className="space-y-3">
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
              Copy this key now — it won&apos;t be shown again. Give it to whoever is setting up the other app.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-[11px] font-mono bg-gray-50 border border-gray-200 rounded-md px-2.5 py-2 break-all">{newKey}</code>
              <button
                type="button"
                onClick={() => { navigator.clipboard.writeText(newKey); toast.success("Copied"); }}
                className="shrink-0 p-2 border border-gray-200 rounded-md hover:bg-gray-50"
                title="Copy"
              >
                <Copy size={14} />
              </button>
            </div>
            <button type="button" onClick={closeCreate} className="w-full px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium">
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            <div>
              <label className="text-xs font-medium text-gray-700">App</label>
              <div className="mt-1">
                <Select
                  value={selectedSlug}
                  onChange={setSelectedSlug}
                  placeholder="Select an app"
                  size="sm"
                  options={appOptions}
                />
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Which app will use this key — just to tell keys apart later, not shown to the other app.</p>
            </div>
            {selectedSlug === "__other__" && (
              <div>
                <label className="text-xs font-medium text-gray-700">Custom label</label>
                <input
                  type="text"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                  placeholder="e.g. internal reporting tool"
                  className="mt-1 w-full border border-gray-300 rounded-md px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-green-500"
                />
              </div>
            )}
            <button
              type="button"
              disabled={!resolvedLabel || createMut.isPending}
              onClick={() => createMut.mutate({ label: resolvedLabel })}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg text-xs font-medium disabled:opacity-50"
            >
              {createMut.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />} Generate
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
