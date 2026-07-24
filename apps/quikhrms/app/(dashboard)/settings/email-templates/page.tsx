"use client";

import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import {
  Mail, Save, Trash2, Search, Bold, Italic, Underline, Strikethrough,
  Code, Link2, List, ListOrdered, Eye, Pencil, Maximize2, Minimize2,
  ChevronDown, AlertTriangle,
} from "lucide-react";
import { clsx } from "clsx";
import { EMAIL_EVENTS, GROUPS, EMAIL_EVENT_MAP, allowedVarNames } from "@/lib/email/registry";
import { findUnknownVars } from "@/lib/email/validate-vars";
import { Modal } from "@/components/hrms/modal";

// This screen customizes the Email channel only. Every event falls back to the
// branded code default when no override is saved (see lib/email/resolve.ts).
const CHANNEL = "Email" as const;

interface Template {
  id: string;
  key: string;
  channel: string;
  subject: string;
  body: string;
  enabled: boolean;
  description: string | null;
  updatedAt: string;
}

type StatusFilter = "all" | "customized" | "default" | "off";

export default function EmailTemplatesPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [enabled, setEnabled] = useState(true);
  const [description, setDescription] = useState("");

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [showAllVars, setShowAllVars] = useState(false);
  const [previewInline, setPreviewInline] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [previewModal, setPreviewModal] = useState(false);
  const [resetConfirm, setResetConfirm] = useState(false);
  const [lastFocused, setLastFocused] = useState<"subject" | "body">("body");

  const subjectRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["settings", "email-templates"],
    queryFn: () => api.get<Template[]>("/api/v1/hrms/settings/email-templates"),
  });
  const tplMap = useMemo(
    () => new Map((data?.data ?? []).filter((t) => t.channel === CHANNEL).map((t) => [t.key, t])),
    [data],
  );

  const upsertMut = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.post<Template>("/api/v1/hrms/settings/email-templates", payload),
    onSuccess: () => {
      toast.success("Template saved");
      qc.invalidateQueries({ queryKey: ["settings", "email-templates"] });
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/settings/email-templates/${id}`),
    onSuccess: () => {
      toast.success("Reset to the built-in default.");
      qc.invalidateQueries({ queryKey: ["settings", "email-templates"] });
    },
  });

  const event = editingKey ? EMAIL_EVENT_MAP[editingKey] : null;
  const existing = editingKey ? tplMap.get(editingKey) : null;

  const startEdit = (key: string) => {
    setEditingKey(key);
    const t = tplMap.get(key);
    setSubject(t?.subject ?? "");
    setBody(t?.body ?? "");
    setEnabled(t?.enabled ?? true);
    setDescription(t?.description ?? "");
    setPreviewInline(false);
    setShowAllVars(false);
  };

  // status of an event based on any saved override.
  const statusOf = (key: string): "customized" | "default" | "off" => {
    const t = tplMap.get(key);
    if (!t) return "default";
    return t.enabled ? "customized" : "off";
  };

  // Left list: group → events, filtered by search + status.
  const groups = useMemo(() => {
    const q = search.trim().toLowerCase();
    return GROUPS.map((group) => {
      const events = EMAIL_EVENTS.filter((e) => {
        if (e.group !== group) return false;
        if (statusFilter !== "all" && statusOf(e.key) !== statusFilter) return false;
        if (q && !(`${e.label} ${e.key}`.toLowerCase().includes(q))) return false;
        return true;
      });
      return { group, events };
    }).filter((g) => g.events.length > 0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, statusFilter, tplMap]);

  // Allowed variable names (includes the implicit companyName).
  const allowed = useMemo(() => (editingKey ? allowedVarNames(editingKey) : new Set<string>()), [editingKey]);
  const unknownVars = useMemo(
    () => (event ? findUnknownVars(subject, body, allowed) : []),
    [event, subject, body, allowed],
  );
  const canSave = !!subject.trim() && !!body.trim() && unknownVars.length === 0 && !upsertMut.isPending;

  // Example values for the live preview.
  const examples = useMemo(() => {
    const m = new Map<string, string>();
    m.set("companyName", "Your Company");
    for (const v of event?.variables ?? []) m.set(v.name, v.example);
    return m;
  }, [event]);
  const render = (html: string) =>
    html.replace(/\{\{\s*(\w+)\s*\}\}/g, (_, n: string) => examples.get(n) ?? `{{${n}}}`);

  // All chip vars = companyName + event vars (deduped).
  const chipVars = useMemo(() => {
    const base = event?.variables ?? [];
    const names = new Set(base.map((v) => v.name));
    const list = [...base];
    if (!names.has("companyName")) {
      list.unshift({ name: "companyName", description: "Your organisation name", example: "Your Company" });
    }
    return list;
  }, [event]);
  const VISIBLE_CHIPS = 8;
  const visibleChips = showAllVars ? chipVars : chipVars.slice(0, VISIBLE_CHIPS);

  // Insert a token into whichever field was last focused, at the cursor.
  const insertToken = (token: string) => {
    if (lastFocused === "subject") {
      const el = subjectRef.current;
      const s = el?.selectionStart ?? subject.length;
      const e = el?.selectionEnd ?? subject.length;
      const next = subject.slice(0, s) + token + subject.slice(e);
      setSubject(next);
      requestAnimationFrame(() => { el?.focus(); if (el) el.selectionStart = el.selectionEnd = s + token.length; });
    } else {
      const el = bodyRef.current;
      const s = el?.selectionStart ?? body.length;
      const e = el?.selectionEnd ?? body.length;
      const next = body.slice(0, s) + token + body.slice(e);
      setBody(next);
      requestAnimationFrame(() => { el?.focus(); if (el) el.selectionStart = el.selectionEnd = s + token.length; });
    }
  };

  // Wrap the body textarea selection with HTML tags (formatting toolbar).
  const wrap = (before: string, after: string) => {
    const el = bodyRef.current;
    if (!el) { setBody((b) => b + before + after); return; }
    const s = el.selectionStart, e = el.selectionEnd;
    const sel = body.slice(s, e);
    const next = body.slice(0, s) + before + sel + after + body.slice(e);
    setBody(next);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = s + before.length;
      el.selectionEnd = e + before.length;
    });
  };

  const status = editingKey ? statusOf(editingKey) : "default";
  const statusBadge = {
    customized: { label: "Customized", cls: "bg-emerald-100 text-emerald-700" },
    default: { label: "Using Default", cls: "bg-gray-100 text-gray-500" },
    off: { label: "Disabled", cls: "bg-amber-100 text-amber-700" },
  }[status];

  const toolBtn = "w-8 h-8 flex items-center justify-center rounded-md text-gray-600 hover:bg-gray-100 hover:text-gray-900 transition disabled:opacity-40 disabled:hover:bg-transparent";

  // ── Body editor block (shared between inline + fullscreen) ──────────
  const bodyEditor = (
    <div className={clsx(
      fullscreen
        ? "fixed inset-0 z-[60] bg-white p-4 flex flex-col"
        : "flex flex-col flex-1 min-h-0 rounded-lg border border-gray-200 overflow-hidden",
    )}>
      {/* Toolbar */}
      <div className="flex items-center gap-1 px-2 py-1.5 border-b border-gray-200 bg-gray-50 shrink-0">
        <div className="flex items-center gap-0.5 pr-1.5 mr-1 border-r border-gray-200">
          <button type="button" title="Bold" className={toolBtn} disabled={previewInline} onClick={() => wrap("<strong>", "</strong>")}><Bold size={14} /></button>
          <button type="button" title="Italic" className={toolBtn} disabled={previewInline} onClick={() => wrap("<em>", "</em>")}><Italic size={14} /></button>
          <button type="button" title="Underline" className={toolBtn} disabled={previewInline} onClick={() => wrap("<u>", "</u>")}><Underline size={14} /></button>
          <button type="button" title="Strikethrough" className={toolBtn} disabled={previewInline} onClick={() => wrap("<s>", "</s>")}><Strikethrough size={14} /></button>
        </div>
        <div className="flex items-center gap-0.5 pr-1.5 mr-1 border-r border-gray-200">
          <button type="button" title="Inline code" className={toolBtn} disabled={previewInline} onClick={() => wrap("<code>", "</code>")}><Code size={14} /></button>
          <button type="button" title="Link" className={toolBtn} disabled={previewInline} onClick={() => wrap('<a href="https://">', "</a>")}><Link2 size={14} /></button>
        </div>
        <div className="flex items-center gap-0.5">
          <button type="button" title="Bulleted list" className={toolBtn} disabled={previewInline} onClick={() => wrap("<ul>\n  <li>", "</li>\n</ul>")}><List size={14} /></button>
          <button type="button" title="Numbered list" className={toolBtn} disabled={previewInline} onClick={() => wrap("<ol>\n  <li>", "</li>\n</ol>")}><ListOrdered size={14} /></button>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setPreviewInline((v) => !v)}
            className={clsx(
              "inline-flex items-center gap-1.5 px-2 h-8 rounded-md text-xs font-medium transition",
              previewInline ? "bg-emerald-100 text-emerald-700" : "text-gray-600 hover:bg-gray-100",
            )}
          >
            {previewInline ? <Pencil size={13} /> : <Eye size={13} />}
            {previewInline ? "Edit" : "Preview"}
          </button>
          <button type="button" title={fullscreen ? "Exit fullscreen" : "Fullscreen"} className={toolBtn} onClick={() => setFullscreen((v) => !v)}>
            {fullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>
      </div>

      {/* Body area */}
      {previewInline ? (
        <div
          className="flex-1 min-h-[10rem] overflow-y-auto p-4 text-sm text-gray-800 prose prose-sm max-w-none"
          // Admin previewing their own template with sample values.
          dangerouslySetInnerHTML={{ __html: render(body) || "<p class='text-gray-400'>Nothing to preview yet.</p>" }}
        />
      ) : (
        <textarea
          ref={bodyRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          onFocus={() => setLastFocused("body")}
          placeholder="Full HTML email body. Use {{variable}} placeholders — sent as-is."
          className="flex-1 min-h-[10rem] w-full p-4 text-[13px] font-mono text-gray-800 resize-none focus:outline-none"
        />
      )}
    </div>
  );

  return (
    <div className="flex flex-col gap-4 h-[calc(100vh-7rem)]">
      {/* ── Header ─────────────────────────────────────────────── */}
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-4 flex items-center gap-3 shrink-0">
        <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center shadow-sm shrink-0">
          <Mail size={20} className="text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-gray-900">Email Templates</h1>
          <p className="text-xs text-gray-500 mt-0.5">
            Customize the subject &amp; body for any system email. Not customized = the branded default is sent.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 flex-1 min-h-0">
        {/* ── Left: template list ──────────────────────────────── */}
        <div className="lg:col-span-1 rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col min-h-0">
          <div className="p-3 border-b border-gray-100 space-y-2 shrink-0">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates…"
                className="w-full pl-8 pr-2 py-2 text-[13px] bg-gray-50 border border-gray-200 rounded-lg placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#bbf7d0] focus:border-[#22c55e] focus:bg-white transition"
              />
            </div>
            <div className="flex gap-1">
              {([
                ["all", "All"], ["customized", "Customized"], ["default", "Default"], ["off", "Off"],
              ] as [StatusFilter, string][]).map(([val, lbl]) => (
                <button
                  key={val}
                  onClick={() => setStatusFilter(val)}
                  className={clsx(
                    "flex-1 px-1 py-1 text-[11px] font-medium rounded-md border transition",
                    statusFilter === val
                      ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                      : "bg-white border-gray-200 text-gray-500 hover:bg-gray-50",
                  )}
                >
                  {lbl}
                </button>
              ))}
            </div>
          </div>

          {isLoading ? (
            <div className="p-6 text-center text-xs text-gray-500">Loading…</div>
          ) : (
            <div className="flex-1 min-h-0 overflow-y-auto">
              {groups.length === 0 ? (
                <div className="p-8 text-center text-xs text-gray-400">No templates match.</div>
              ) : groups.map(({ group, events }) => (
                <div key={group}>
                  <div className="px-4 py-1.5 bg-gray-50/70 text-[11px] font-semibold uppercase tracking-wide text-gray-500 border-y border-gray-100">
                    {group}
                  </div>
                  <ul>
                    {events.map((e) => {
                      const st = statusOf(e.key);
                      const active = editingKey === e.key;
                      const badge = {
                        customized: "bg-emerald-100 text-emerald-700",
                        default: "bg-gray-100 text-gray-400",
                        off: "bg-amber-100 text-amber-700",
                      }[st];
                      const badgeLbl = { customized: "Custom", default: "Default", off: "Off" }[st];
                      return (
                        <li key={e.key}>
                          <button
                            onClick={() => startEdit(e.key)}
                            className={clsx(
                              "w-full text-left pl-4 pr-3 py-2.5 flex items-center gap-2.5 border-l-2 transition",
                              active
                                ? "bg-emerald-50 border-[#22c55e]"
                                : "border-transparent hover:bg-gray-50",
                            )}
                          >
                            <Mail size={15} className={clsx("shrink-0", active ? "text-[#16a34a]" : "text-emerald-400")} />
                            <div className="flex-1 min-w-0">
                              <p className={clsx("text-[13px] font-medium truncate", active ? "text-[#166534]" : "text-gray-900")}>
                                {e.label}
                              </p>
                              <p className="text-[11px] text-gray-400 font-mono truncate">{e.key}</p>
                            </div>
                            <span className={clsx("shrink-0 px-1.5 py-0.5 text-[10px] rounded font-semibold", badge)}>
                              {badgeLbl}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Right: editor ────────────────────────────────────── */}
        <div className="lg:col-span-2 rounded-xl border border-gray-200 bg-white shadow-sm flex flex-col min-h-0">
          {!event ? (
            <div className="m-auto text-center py-12 px-6 text-gray-500">
              <div className="w-12 h-12 rounded-xl bg-gray-50 flex items-center justify-center mx-auto mb-3">
                <Mail size={22} className="text-gray-300" />
              </div>
              <p className="text-[13px] font-medium text-gray-700">Pick a template</p>
              <p className="text-xs text-gray-500 mt-0.5">Choose an email from the left to customize it.</p>
            </div>
          ) : (
            <div className="flex flex-col flex-1 min-h-0">
              {/* Editor header — title, status, and the variable chips inline
                  (moved here from the body to give the editor more height). */}
              <div className="px-5 py-3.5 border-b border-gray-100 shrink-0 space-y-2.5">
                <div className="flex items-start gap-3">
                  <div className="min-w-0">
                    <h2 className="text-[15px] font-semibold text-gray-900 truncate">{event.label}</h2>
                    <p className="text-[11px] text-gray-500 mt-0.5">
                      <span className="font-mono">{event.key}</span> · {event.group}
                    </p>
                  </div>
                  <span className={clsx("ml-auto shrink-0 px-2 py-1 text-[11px] rounded-md font-semibold", statusBadge.cls)}>
                    {statusBadge.label}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5" title="Click a variable to insert it into the focused field">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-gray-400 mr-0.5">Variables</span>
                  {visibleChips.map((v) => (
                    <button
                      key={v.name}
                      type="button"
                      title={`${v.description} — e.g. ${v.example}`}
                      onClick={() => insertToken(`{{${v.name}}}`)}
                      className="px-2 py-1 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-700 font-mono text-[11px] hover:bg-emerald-100 transition"
                    >
                      {`{{${v.name}}}`}
                    </button>
                  ))}
                  {chipVars.length > VISIBLE_CHIPS && (
                    <button
                      type="button"
                      onClick={() => setShowAllVars((v) => !v)}
                      className="inline-flex items-center gap-0.5 px-2 py-1 rounded-md border border-gray-200 text-gray-500 text-[11px] hover:bg-gray-50 transition"
                    >
                      {showAllVars ? "Less" : `+${chipVars.length - VISIBLE_CHIPS} more`}
                      <ChevronDown size={12} className={clsx("transition-transform", showAllVars && "rotate-180")} />
                    </button>
                  )}
                </div>
              </div>

              <div className="flex flex-col flex-1 min-h-0 gap-4 p-5 overflow-y-auto">
                {/* Subject */}
                <div className="shrink-0">
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Subject</label>
                  <input
                    ref={subjectRef}
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                    onFocus={() => setLastFocused("subject")}
                    placeholder="e.g. Leave {{leaveType}} {{status}} for {{employeeName}}"
                    className="w-full px-3 py-2.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-[#bbf7d0] focus:border-[#22c55e] transition"
                  />
                </div>

                {/* Body */}
                <div className="flex flex-col flex-1 min-h-0">
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5 shrink-0">Body (HTML)</label>
                  {bodyEditor}
                </div>

                {unknownVars.length > 0 && (
                  <div className="rounded-lg border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 flex items-start gap-2 shrink-0">
                    <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                    <span>
                      Unknown variable{unknownVars.length > 1 ? "s" : ""}:{" "}
                      <span className="font-mono">{unknownVars.map((n) => `{{${n}}}`).join(", ")}</span>. Remove
                      {unknownVars.length > 1 ? " them" : " it"} or pick from the list above.
                    </span>
                  </div>
                )}

                {/* Description */}
                <div className="shrink-0">
                  <label className="block text-[13px] font-medium text-gray-700 mb-1.5">Description (internal)</label>
                  <textarea
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={2}
                    placeholder="Add internal notes or description for this template…"
                    className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-[#bbf7d0] focus:border-[#22c55e] transition"
                  />
                </div>
              </div>

              {/* Footer actions */}
              <div className="px-5 py-3 border-t border-gray-100 flex items-center gap-3 shrink-0">
                <label className="flex items-center gap-2 text-xs text-gray-700 cursor-pointer">
                  <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="w-4 h-4 accent-[#22c55e]" />
                  Enabled <span className="text-gray-400">(uncheck to suppress this email entirely)</span>
                </label>

                <div className="ml-auto flex items-center gap-2">
                  {existing && (
                    <button
                      onClick={() => setResetConfirm(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50 rounded-lg transition"
                    >
                      <Trash2 size={13} /> Reset to default
                    </button>
                  )}
                  <button
                    onClick={() => setPreviewModal(true)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                  >
                    <Eye size={13} /> Preview
                  </button>
                  <button
                    onClick={() =>
                      upsertMut.mutate({
                        key: editingKey, channel: CHANNEL, subject, body, enabled,
                        description: description || null,
                      })
                    }
                    disabled={!canSave}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-[#22c55e] hover:bg-[#16a34a] disabled:opacity-50 disabled:cursor-not-allowed rounded-lg shadow-sm transition"
                  >
                    <Save size={13} /> {upsertMut.isPending ? "Saving…" : "Save Template"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Full email preview */}
      {event && (
        <Modal open={previewModal} onClose={() => setPreviewModal(false)} title="Email preview" subtitle={event.label} size="lg">
          <div className="space-y-3">
            <div className="text-xs text-gray-500">
              Subject
              <div className="mt-1 text-sm font-semibold text-gray-900">{render(subject) || "—"}</div>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <div
                className="text-sm text-gray-800 prose prose-sm max-w-none"
                dangerouslySetInnerHTML={{ __html: render(body) || "<p class='text-gray-400'>Empty body.</p>" }}
              />
            </div>
            <p className="text-[11px] text-gray-400">Preview uses sample values for each variable.</p>
          </div>
        </Modal>
      )}

      <Modal open={resetConfirm} onClose={() => setResetConfirm(false)} title="Reset to default?" size="sm">
        <div className="space-y-4">
          <p className="text-sm text-gray-700">
            This removes your custom subject &amp; body for <b>{event?.label ?? "this email"}</b>. The built-in default will be sent instead.
          </p>
          <div className="flex justify-end gap-2">
            <button onClick={() => setResetConfirm(false)} className="px-3.5 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50">Cancel</button>
            <button
              onClick={() => { if (existing) deleteMut.mutate(existing.id); setResetConfirm(false); }}
              disabled={deleteMut.isPending}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-red-600 hover:bg-red-700 disabled:opacity-50 rounded-lg">
              <Trash2 size={13} /> {deleteMut.isPending ? "Resetting…" : "Reset to default"}
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
