"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import {
  ChevronLeft, Plus, Pencil, Trash2, TrendingUp,
  TrendingDown, Minus, AlertCircle, FileText,
} from "lucide-react";
import SWTPreview from "./SWTPreview";
import { useSWTEntries, useCreateSWTEntry, useUpdateSWTEntry, useDeleteSWTEntry } from "@/lib/hooks/useSwt";
import { EmptyState, useConfirm } from "@quikit/ui";
import { getFiscalYear, getFiscalQuarter } from "@/lib/utils/fiscal";
import {
  SWT_TYPE_CONFIG, TREND_DIRECTION_CONFIG,
  TREND_CATEGORIES, TREND_CATEGORY_CONFIG,
  IMPACT_LABEL, BOOK_QUESTION,
  type SWTType, type TrendDirection, type TrendCategory,
} from "@/lib/schemas/swtSchema";

interface SWTEntryRow {
  id: string;
  type: SWTType;
  content: string;
  impact: string | null;
  category: TrendCategory | null;
  trendDirection: TrendDirection | null;
  sortOrder: number;
  quarter: string;
  year: number;
}

const TREND_ICONS = {
  positive: TrendingUp,
  negative: TrendingDown,
  neutral:  Minus,
} as const;

const QUARTERS = ["Q1", "Q2", "Q3", "Q4"];

export default function SWTPage() {
  const confirm = useConfirm();
  const [quarter, setQuarter] = useState<string>(getFiscalQuarter());
  const [year, setYear]       = useState(getFiscalYear());
  const years = Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 2 + i);

  const { data, isLoading } = useSWTEntries({ quarter, year });
  const entries = useMemo(() => (data as SWTEntryRow[] | undefined) ?? [], [data]);

  const createMutation = useCreateSWTEntry();
  const deleteMutation = useDeleteSWTEntry();

  const [editingId, setEditingId]       = useState<string | null>(null);
  const [showModal, setShowModal]       = useState(false);
  const [showPreview, setShowPreview]   = useState(false);
  const [modalType, setModalType]       = useState<SWTType>("strength");
  const [formContent, setFormContent]   = useState("");
  const [formImpact, setFormImpact]     = useState("");
  const [formCategory, setFormCategory] = useState<TrendCategory | "">("");
  const [formDirection, setFormDirection] = useState<TrendDirection>("neutral");
  const [formError, setFormError]       = useState<string | null>(null);

  const updateMutation = useUpdateSWTEntry(editingId ?? "");

  function openCreate(type: SWTType) {
    setEditingId(null);
    setModalType(type);
    setFormContent("");
    setFormImpact("");
    setFormCategory("");
    setFormDirection("neutral");
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(entry: SWTEntryRow) {
    setEditingId(entry.id);
    setModalType(entry.type);
    setFormContent(entry.content);
    setFormImpact(entry.impact ?? "");
    setFormCategory(entry.category ?? "");
    setFormDirection(entry.trendDirection ?? "neutral");
    setFormError(null);
    setShowModal(true);
  }

  async function handleSave() {
    if (!formContent.trim()) { setFormError("Content is required"); return; }
    setFormError(null);
    try {
      const payload = {
        content:        formContent.trim(),
        impact:         formImpact.trim() || null,
        category:       modalType === "trend" ? (formCategory || null) : null,
        trendDirection: modalType === "trend" ? formDirection : null,
      };
      if (editingId) {
        await updateMutation.mutateAsync(payload);
      } else {
        await createMutation.mutateAsync({ quarter, year, type: modalType, ...payload });
      }
      setShowModal(false);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function handleDelete(entry: SWTEntryRow) {
    if (!(await confirm({
      title: "Delete this entry?",
      description: "This cannot be undone.",
      confirmLabel: "Delete",
      tone: "danger",
    }))) return;
    await deleteMutation.mutateAsync(entry.id);
  }

  const byType = useMemo(() => {
    const map: Record<SWTType, SWTEntryRow[]> = { strength: [], weakness: [], trend: [] };
    entries.forEach((e) => map[e.type]?.push(e));
    return map;
  }, [entries]);

  const hasAny = entries.length > 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        <Link
          href="/performance/goals"
          className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-2 transition-colors"
        >
          <ChevronLeft className="h-3.5 w-3.5" /> Back to Pillar Hub
        </Link>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-base font-semibold text-gray-900">SWT Analysis</h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Strengths · Weaknesses · Trends — Scaling Up quarterly strategic analysis.
            </p>
          </div>
          {/* Quarter / Year selector + Preview button */}
          <div className="flex items-center gap-2">
            <div className="flex border border-gray-200 rounded-md overflow-hidden">
              {QUARTERS.map((q) => (
                <button
                  key={q}
                  onClick={() => setQuarter(q)}
                  className={`px-2.5 py-1.5 text-xs font-medium transition-colors ${
                    quarter === q ? "bg-accent-600 text-white" : "text-gray-600 hover:bg-gray-50"
                  }`}
                >
                  {q}
                </button>
              ))}
            </div>
            <select
              value={year}
              onChange={(e) => setYear(Number(e.target.value))}
              className="text-xs border border-gray-200 rounded-md px-2 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400"
            >
              {years.map((y) => <option key={y} value={y}>{y}</option>)}
            </select>
            <button
              onClick={() => setShowPreview(true)}
              disabled={entries.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="See the Scaling Up SWT worksheet preview and export PDF"
            >
              <FileText className="h-3.5 w-3.5" />
              Preview / Export
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 p-5 min-h-0">
        {isLoading && <div className="text-sm text-gray-400 text-center py-16">Loading…</div>}

        {!isLoading && !hasAny && (
          <div className="bg-white border border-gray-200 rounded-xl">
            <EmptyState
              icon={TrendingUp}
              title={`Start your ${quarter} ${year} SWT analysis`}
              message="Capture your organization's internal strengths, weaknesses, and the external trends shaping your industry. This feeds directly into your strategic planning."
              action={{ label: "Add first entry", onClick: () => openCreate("trend") }}
            />
          </div>
        )}

        {!isLoading && (
          <div className="max-w-6xl mx-auto space-y-4">
            {/* ── Trends — full width on top, mirrors the book ── */}
            <SectionCard
              type="trend"
              entries={byType.trend}
              onAdd={() => openCreate("trend")}
              onEdit={openEdit}
              onDelete={handleDelete}
            />

            {/* ── Strengths + Weaknesses side-by-side ── */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <SectionCard
                type="strength"
                entries={byType.strength}
                onAdd={() => openCreate("strength")}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
              <SectionCard
                type="weakness"
                entries={byType.weakness}
                onAdd={() => openCreate("weakness")}
                onEdit={openEdit}
                onDelete={handleDelete}
              />
            </div>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">
                {editingId ? "Edit entry" : `Add ${SWT_TYPE_CONFIG[modalType].label.slice(0, -1)}`}
              </h2>
              <p className="text-[11px] text-gray-500 mt-0.5 italic leading-snug">{BOOK_QUESTION[modalType]}</p>
            </div>
            <div className="px-6 py-4 space-y-3 flex-1 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {modalType === "strength" ? "Strength" : modalType === "weakness" ? "Weakness" : "Trend"} *
                </label>
                <textarea
                  value={formContent}
                  onChange={(e) => setFormContent(e.target.value)}
                  rows={2}
                  autoFocus
                  placeholder={
                    modalType === "strength" ? "e.g. Strong brand recognition in the SMB market"
                    : modalType === "weakness" ? "e.g. Limited enterprise sales capability"
                    : "e.g. AI adoption accelerating across our target segments"
                  }
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>

              {/* Impact / why (contextual label, optional) */}
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  {IMPACT_LABEL[modalType]} <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={formImpact}
                  onChange={(e) => setFormImpact(e.target.value)}
                  rows={3}
                  placeholder={
                    modalType === "strength" ? "Why this matters — what success it has driven."
                    : modalType === "weakness" ? "Why it's structural / unlikely to change soon."
                    : "How this trend lands on your industry or organization."
                  }
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>

              {modalType === "trend" && (
                <>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">
                      Trend category <span className="text-gray-400 font-normal">(optional)</span>
                    </label>
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value as TrendCategory | "")}
                      className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 bg-white focus:outline-none focus:ring-1 focus:ring-accent-400"
                    >
                      <option value="">— None —</option>
                      {TREND_CATEGORIES.map((c) => (
                        <option key={c} value={c}>{TREND_CATEGORY_CONFIG[c].label}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-medium text-gray-700 mb-1">Direction</label>
                    <div className="flex gap-2">
                      {(["positive", "negative", "neutral"] as TrendDirection[]).map((dir) => {
                        const dcfg = TREND_DIRECTION_CONFIG[dir];
                        const TIcon = TREND_ICONS[dir];
                        return (
                          <button
                            key={dir}
                            onClick={() => setFormDirection(dir)}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-medium border transition-colors ${
                              formDirection === dir
                                ? `${dcfg.bg} ${dcfg.text} border-transparent`
                                : "border-gray-200 text-gray-500 hover:bg-gray-50"
                            }`}
                          >
                            <TIcon className="h-3.5 w-3.5" />
                            {dcfg.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              {formError && (
                <div className="flex items-center gap-1.5 text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
                  {formError}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 px-6 py-3 border-t border-gray-100 flex-shrink-0 bg-white">
              <button onClick={() => setShowModal(false)} className="px-3 py-1.5 text-xs text-gray-600 hover:bg-gray-50 rounded-md">
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="px-4 py-1.5 text-xs font-semibold text-white bg-accent-600 hover:bg-accent-700 rounded-md disabled:opacity-50"
              >
                {(createMutation.isPending || updateMutation.isPending) ? "Saving…" : editingId ? "Save" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scaling Up SWT worksheet preview + PDF export */}
      {showPreview && (
        <SWTPreview
          entries={entries}
          quarter={quarter}
          year={year}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

// ─── Section card (one per pillar) ───────────────────────────────────────────

function SectionCard({
  type, entries, onAdd, onEdit, onDelete,
}: {
  type: SWTType;
  entries: SWTEntryRow[];
  onAdd: () => void;
  onEdit: (e: SWTEntryRow) => void;
  onDelete: (e: SWTEntryRow) => void;
}) {
  const cfg = SWT_TYPE_CONFIG[type];

  return (
    <div className={`flex flex-col bg-white border rounded-xl overflow-hidden ${cfg.border}`}>
      <div className={`px-4 py-3 ${cfg.headerBg}`}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className={`text-sm font-bold ${cfg.headerText}`}>{cfg.label}</h2>
            <p className="text-[11px] text-gray-600 mt-1 italic leading-snug">{BOOK_QUESTION[type]}</p>
          </div>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full flex-shrink-0 ${cfg.badgeBg} ${cfg.badgeText}`}>
            {entries.length}
          </span>
        </div>
      </div>

      <div className="flex-1 p-3 space-y-2">
        {entries.map((entry) => (
          <EntryCard
            key={entry.id}
            entry={entry}
            onEdit={() => onEdit(entry)}
            onDelete={() => onDelete(entry)}
            cfg={cfg}
          />
        ))}

        <button
          onClick={onAdd}
          className="w-full flex items-center justify-center gap-1.5 py-2 border border-dashed border-gray-200 rounded-lg text-xs text-gray-400 hover:border-gray-300 hover:text-gray-600 transition-colors mt-1"
        >
          <Plus className="h-3.5 w-3.5" /> Add {cfg.label.slice(0, -1)}
        </button>
      </div>
    </div>
  );
}

// ─── Entry card (one per row) ────────────────────────────────────────────────

function EntryCard({
  entry, onEdit, onDelete, cfg,
}: {
  entry: SWTEntryRow;
  onEdit: () => void;
  onDelete: () => void;
  cfg: typeof SWT_TYPE_CONFIG[SWTType];
}) {
  const TIcon = entry.trendDirection ? TREND_ICONS[entry.trendDirection] : null;
  const dcfg  = entry.trendDirection ? TREND_DIRECTION_CONFIG[entry.trendDirection] : null;
  const ccfg  = entry.category ? TREND_CATEGORY_CONFIG[entry.category] : null;

  return (
    <div className={`group flex items-start gap-2 p-2.5 rounded-lg border ${cfg.bg} ${cfg.border}`}>
      <div className={`h-1.5 w-1.5 rounded-full mt-1.5 flex-shrink-0 ${cfg.dotColor}`} />
      <div className="flex-1 min-w-0">
        <p className="text-xs text-gray-800 leading-relaxed font-medium">{entry.content}</p>
        {entry.impact && (
          <p className="text-[11px] text-gray-500 italic mt-1 leading-snug">{entry.impact}</p>
        )}
        <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
          {ccfg && (
            <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${ccfg.bg} ${ccfg.text}`}>
              {ccfg.label}
            </span>
          )}
          {TIcon && dcfg && (
            <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full ${dcfg.bg} ${dcfg.text}`}>
              <TIcon className="h-2.5 w-2.5" />
              {dcfg.label}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
        <button onClick={onEdit} className="p-1 rounded hover:bg-white text-gray-400">
          <Pencil className="h-3 w-3" />
        </button>
        <button onClick={onDelete} className="p-1 rounded hover:bg-white text-red-400">
          <Trash2 className="h-3 w-3" />
        </button>
      </div>
    </div>
  );
}
