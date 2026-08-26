"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Plus, Copy, Ban, Loader2, ShieldCheck, Trash2, FileDown } from "lucide-react";
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
  scope: string;
  isActive: boolean;
  createdAt: string;
  revokedAt: string | null;
  lastUsedAt: string | null;
}

const SCOPE_OPTIONS = [
  { value: "departments", label: "Departments" },
  { value: "employees", label: "Employees" },
  { value: "jobRequisitions", label: "Job Requisitions (careers site feed + apply)" },
] as const;

function fmt(d: string | null): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
}

function scopeLabel(scope: string): string {
  if (scope === "all") return "All";
  return scope.split(",").map((s) => SCOPE_OPTIONS.find((o) => o.value === s)?.label ?? s).join(", ");
}

// Opens a self-contained, print-ready integration guide in a new tab — the
// admin hits their browser's own "Save as PDF" (no PDF library needed here).
// Only offered for the "jobRequisitions" scope: that's the one key type
// meant for an OUTSIDE recipient (the org's own website developer) rather
// than another QuikIT engineering team, so it's the one that benefits from a
// handoff document instead of just a copied key.
function buildIntegrationGuideHtml(apiKey: string): string {
  const origin = window.location.origin;
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  return `<!doctype html><html><head><meta charset="utf-8"><title>Careers API Integration Guide</title><style>
    * { box-sizing: border-box; }
    body { font-family: -apple-system, "Segoe UI", Helvetica, Arial, sans-serif; color: #16130f; margin: 0; padding: 36px 44px; font-size: 13px; line-height: 1.55; }
    h1 { font-size: 20px; margin: 0 0 4px; }
    .subtitle { color: #6e6a62; font-size: 12px; margin: 0 0 22px; }
    h2 { font-size: 13px; text-transform: uppercase; letter-spacing: .04em; color: #a70000; border-bottom: 1px solid #e5e1da; padding-bottom: 6px; margin: 26px 0 12px; }
    h2:first-of-type { margin-top: 8px; }
    p { margin: 0 0 10px; }
    code, pre { font-family: "SF Mono", Consolas, "Courier New", monospace; font-size: 11.5px; }
    .box { background: #f5f3ef; border: 1px solid #e5e1da; border-radius: 4px; padding: 12px 14px; margin: 0 0 14px; overflow-x: auto; }
    .box pre { margin: 0; white-space: pre-wrap; word-break: break-all; }
    .method { display: inline-block; font-weight: 700; font-size: 11px; padding: 1px 7px; border-radius: 3px; color: #fff; margin-right: 6px; }
    .get { background: #2563eb; } .post { background: #a70000; }
    table { width: 100%; border-collapse: collapse; margin: 0 0 14px; font-size: 12px; }
    th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid #e5e1da; vertical-align: top; }
    th { color: #6e6a62; text-transform: uppercase; font-size: 10.5px; letter-spacing: .03em; }
    .req { color: #a70000; font-weight: 600; } .opt { color: #9a958c; }
    ul { margin: 0 0 10px; padding-left: 20px; } li { margin-bottom: 3px; }
    .note { background: #fff8f0; border: 1px solid #f0ddb8; border-radius: 4px; padding: 10px 12px; font-size: 12px; margin: 10px 0; }
    .footer { margin-top: 28px; color: #9a958c; font-size: 11px; }
    .no-print { margin-bottom: 24px; }
    .no-print button { font: inherit; padding: 8px 16px; background: #16130f; color: #fff; border: none; border-radius: 4px; cursor: pointer; }
    @media print { .no-print { display: none; } }
  </style></head><body>
    <div class="no-print"><button onclick="window.print()">Print / Save as PDF</button></div>
    <h1>Careers API — Integration Guide</h1>
    <p class="subtitle">For the website developer &middot; connects your careers site to the HRMS</p>

    <h2>1. Overview</h2>
    <p>Two endpoints, one API key. Use the first to pull the live open-jobs list. Use the second when a candidate submits an application for a specific job.</p>

    <h2>2. Authentication</h2>
    <p>Every request needs this header:</p>
    <div class="box"><pre>x-api-key: ${esc(apiKey)}</pre></div>
    <p>Call both endpoints <strong>from your server</strong> (not from browser JavaScript) — the key must never appear in page source or a network request visible to visitors.</p>

    <h2>3. Get Open Jobs</h2>
    <p><span class="method get">GET</span><code>${esc(origin)}/api/v1/hrms/job-requisitions/external</code></p>
    <p>Returns every open, publishable job for your org. No parameters.</p>
    <div class="box"><pre>[
  {
    "id": "...",
    "title": "Business Development Manager",
    "type": "Full-time",
    "location": "Pune, India",
    "workPreference": "On-site",
    "department": "Business Development",
    "experienceRange": "5–10 Years",
    "openings": 1,
    "desc": "...",
    "overview": "...",
    "responsibilities": ["...", "..."],
    "requirements": ["...", "..."],
    "offer": ["...", "..."]
  }
]</pre></div>

    <h2>4. Submit an Application</h2>
    <p><span class="method post">POST</span><code>${esc(origin)}/api/v1/hrms/job-requisitions/external/apply</code></p>
    <p>Send as <code>multipart/form-data</code> (not JSON) — it includes a file.</p>
    <table>
      <tr><th>Field</th><th>Required</th><th>Notes</th></tr>
      <tr><td><code>jobId</code></td><td class="req">Required</td><td>The <code>id</code> from the jobs list above</td></tr>
      <tr><td><code>fullName</code></td><td class="req">Required</td><td>One field, e.g. "Jane Doe"</td></tr>
      <tr><td><code>email</code></td><td class="req">Required</td><td></td></tr>
      <tr><td><code>phone</code></td><td class="opt">Optional</td><td></td></tr>
      <tr><td><code>linkedIn</code></td><td class="opt">Optional</td><td></td></tr>
      <tr><td><code>portfolio</code></td><td class="opt">Optional</td><td></td></tr>
      <tr><td><code>years</code></td><td class="opt">Optional</td><td>Years of experience, e.g. "3"</td></tr>
      <tr><td><code>message</code></td><td class="opt">Optional</td><td>Cover letter / message text</td></tr>
      <tr><td><code>resume</code></td><td class="req">Required</td><td>File — PDF or Word, <strong>max 4MB</strong></td></tr>
    </table>
    <p>Any other field you send is not rejected — it's stored and shown to the recruiter, even without a dedicated column here.</p>
    <p>Success: <code>{ "success": true, "data": { "applied": true, "applicationId": "..." } }</code></p>
    <p>Failure: <code>{ "success": false, "error": "&lt;human-readable reason&gt;" }</code></p>

    <h2>5. Things to Know</h2>
    <ul>
      <li>Resume: PDF, DOC, or DOCX only, max 4MB.</li>
      <li>A candidate applying twice for the same job with the same email gets a friendly "already applied" message.</li>
      <li>Rate limits: jobs feed 60/min, apply 30/min per key — cache the jobs feed for a minute or two rather than fetching on every page view.</li>
      <li>A 401 means the API key is missing, wrong, or was revoked.</li>
    </ul>

    <div class="note"><strong>Keep this file secure.</strong> It contains a live API key — share it only with whoever is integrating your website, then delete this copy. Revoke/regenerate anytime from Settings → Integrations → Directory API.</div>
    <div class="footer">Generated ${esc(new Date().toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" }))}</div>
  </body></html>`;
}

export default function DepartmentApiKeysPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const dialog = useDialog();
  const toast = useToast();
  const [showCreate, setShowCreate] = useState(false);
  const [selectedSlug, setSelectedSlug] = useState("");
  const [customLabel, setCustomLabel] = useState("");
  const [selectedScope, setSelectedScope] = useState<string[]>([]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [newKeyScope, setNewKeyScope] = useState<string[]>([]);

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
    mutationFn: (body: { label: string; scope: string[] }) =>
      api.post<{ apiKey: string }>("/api/v1/hrms/settings/integrations/department-api-keys", body),
    onSuccess: (res, vars) => {
      qc.invalidateQueries({ queryKey: ["settings", "department-api-keys"] });
      setNewKey(res.data.apiKey);
      setNewKeyScope(vars.scope);
      setSelectedSlug("");
      setCustomLabel("");
      setSelectedScope([]);
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

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/settings/integrations/department-api-keys/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["settings", "department-api-keys"] });
      toast.success("Key deleted");
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Could not delete key"),
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

  const confirmDelete = async (k: KeyRow) => {
    const okConfirm = await dialog.confirm({
      title: "Delete this key permanently?",
      description: `"${k.label}" will be removed from this list. This can't be undone.`,
      confirmLabel: "Delete",
      variant: "danger",
    });
    if (okConfirm) deleteMut.mutate(k.id);
  };

  const closeCreate = () => { setShowCreate(false); setNewKey(null); setNewKeyScope([]); setSelectedSlug(""); setCustomLabel(""); setSelectedScope([]); };

  const downloadIntegrationGuide = () => {
    if (!newKey) return;
    const w = window.open("", "_blank");
    if (!w) { toast.error("Popup blocked", "Allow popups for this site to view the integration guide."); return; }
    w.document.write(buildIntegrationGuideHtml(newKey));
    w.document.close();
  };

  const toggleScope = (value: string) => {
    setSelectedScope((prev) => (prev.includes(value) ? prev.filter((s) => s !== value) : [...prev, value]));
  };

  return (
    <div className="p-4 space-y-4">
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-base font-semibold text-gray-900">Directory API</h1>
          <p className="text-xs text-gray-500 mt-1">
            Let another QuikIT app (e.g. quikscale) read this org&apos;s Department and Employee directory, or let your OWN careers website read open Job Requisitions and send applications back — all over a secure API. One key per integration — generate and revoke anytime.
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
                <th className="px-4 py-2.5">Access</th>
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
                  <td className="px-4 py-2.5 text-gray-600">{scopeLabel(k.scope)}</td>
                  <td className="px-4 py-2.5">
                    <span className={k.isActive ? "inline-flex items-center gap-1 text-green-700" : "inline-flex items-center gap-1 text-gray-400"}>
                      {k.isActive ? <ShieldCheck size={12} /> : <Ban size={12} />} {k.isActive ? "Active" : "Revoked"}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-gray-500">{fmt(k.createdAt)}</td>
                  <td className="px-4 py-2.5 text-gray-500">{fmt(k.lastUsedAt)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1.5">
                      {k.isActive ? (
                        <button
                          type="button"
                          onClick={() => confirmRevoke(k)}
                          disabled={revokeMut.isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-red-600 border border-red-200 rounded-md hover:bg-red-50 disabled:opacity-50"
                        >
                          <Ban size={11} /> Revoke
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => confirmDelete(k)}
                          disabled={deleteMut.isPending}
                          className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-medium text-gray-500 border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-50"
                        >
                          <Trash2 size={11} /> Delete
                        </button>
                      )}
                    </div>
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
            {newKeyScope.includes("jobRequisitions") && (
              <button
                type="button"
                onClick={downloadIntegrationGuide}
                className="w-full inline-flex items-center justify-center gap-1.5 px-3 py-2 border border-gray-300 text-gray-700 rounded-lg text-xs font-medium hover:bg-gray-50"
              >
                <FileDown size={14} /> Download Integration Guide
              </button>
            )}
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
            <div>
              <label className="text-xs font-medium text-gray-700">What can this key read?</label>
              <div className="mt-1.5 space-y-1.5">
                {SCOPE_OPTIONS.map((o) => (
                  <label key={o.value} className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={selectedScope.includes(o.value)}
                      onChange={() => toggleScope(o.value)}
                      className="rounded border-gray-300 text-green-600 focus:ring-green-500"
                    />
                    {o.label}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-gray-400 mt-1">Pick only what this app actually needs — this key will fail on anything else.</p>
            </div>
            <button
              type="button"
              disabled={!resolvedLabel || selectedScope.length === 0 || createMut.isPending}
              onClick={() => createMut.mutate({ label: resolvedLabel, scope: selectedScope })}
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
