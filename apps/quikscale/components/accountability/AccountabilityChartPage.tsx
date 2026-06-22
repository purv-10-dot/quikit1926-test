"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import {
  ChevronLeft, Plus, Pencil, Trash2, User,
  GitBranch, UserCheck, AlertCircle,
  Users as UsersIcon, AlertTriangle, CheckCircle2, Target, FileText,
} from "lucide-react";
import AccountabilityChartPreview from "./AccountabilityChartPreview";
import {
  useAccountabilityFunctions,
  useCreateAccountabilityFunction,
  useUpdateAccountabilityFunction,
  useDeleteAccountabilityFunction,
} from "@/lib/hooks/useAccountability";
import { useUsers } from "@/lib/hooks/useUsers";
import { useTeams } from "@/lib/hooks/useTeams";
import { AddButton, EmptyState, useConfirm, UserPicker, DropdownPicker } from "@quikit/ui";
import {
  FACE_DEFAULT_FUNCTIONS, PACE_DEFAULT_PROCESSES,
  type ChartType, type AccountabilityInsights,
} from "@/lib/schemas/accountabilitySchema";

interface FunctionRow {
  id: string;
  name: string;
  description: string | null;
  leadingIndicators: string | null;
  expectedOutcomes: string | null;
  assignedToUserId: string | null;
  parentFunctionId: string | null;
  sortOrder: number;
  assignedTo: { id: string; firstName: string; lastName: string; email: string } | null;
  childFunctions: FunctionRow[];
}

interface UserRow {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

interface ApiPayload {
  functions: FunctionRow[];
  insights: AccountabilityInsights;
}

// chartType-aware copy. Scaling Up framing: FACe = function accountability
// ("Accountable for"); PACe = process ownership ("Owner").
const CONFIG = {
  face: {
    title: "FACe",
    fullName: "Function Accountability Chart",
    description: "Map every organizational function to an accountable person. Right people, right roles.",
    icon: UserCheck,
    accent: "violet" as const,
    defaultItems: FACE_DEFAULT_FUNCTIONS,
    itemLabel: "Function",
    accountableLabel: "Accountable for",   // per client feedback (was "Assigned to")
    accountableQuestion: "Who is accountable for handling this?",
    outcomesLabel: "Expected key outcomes",
    outcomesHelp: "What this person owns delivering. One per line.",
    emptyTitle: "Build your Function Accountability Chart",
    emptyMessage: "Map every key function in your organization to an accountable person. Identify gaps, duplicates, and misalignments at a glance.",
    href: "/performance/face",
    backHref: "/performance/goals" as string | null,
  },
  pace: {
    title: "PACe",
    fullName: "Process Accountability Chart",
    description: "Map every core business process to an owner. 4–9 processes that drive your business.",
    icon: GitBranch,
    accent: "blue" as const,
    defaultItems: PACE_DEFAULT_PROCESSES,
    itemLabel: "Process",
    accountableLabel: "Process owner",
    accountableQuestion: "Who owns this process?",
    outcomesLabel: "Key outcomes",
    outcomesHelp: "Better / faster / cheaper goals for this process. One per line.",
    emptyTitle: "Build your Process Accountability Chart",
    emptyMessage: "Identify 4–9 core processes that run your business and assign an owner to each. Unowned processes are silent risks.",
    href: "/performance/pace",
    // No Pillar Hub back-link on PACe (per product spec). FACe keeps it.
    backHref: null as string | null,
  },
} as const;

export default function AccountabilityChartPage({ chartType }: { chartType: ChartType }) {
  const cfg = CONFIG[chartType];
  const Icon = cfg.icon;
  const confirm = useConfirm();

  const { data, isLoading } = useAccountabilityFunctions(chartType);
  const payload = (data as ApiPayload | undefined) ?? { functions: [], insights: { totalFunctions: 0, accountableCount: 0, emptySeatsCount: 0, overloadedOwners: [] } };
  const functions = useMemo(() => payload.functions ?? [], [payload]);
  const insights  = payload.insights ?? { totalFunctions: 0, accountableCount: 0, emptySeatsCount: 0, overloadedOwners: [] };

  const createMutation = useCreateAccountabilityFunction(chartType);
  const deleteMutation = useDeleteAccountabilityFunction(chartType);

  const [showModal, setShowModal]        = useState(false);
  const [showPreview, setShowPreview]    = useState(false);
  const [editingItem, setEditingItem]    = useState<FunctionRow | null>(null);
  const [parentId, setParentId]          = useState<string | null>(null);
  const [formName, setFormName]          = useState("");
  const [formDesc, setFormDesc]          = useState("");
  const [formLeading, setFormLeading]    = useState("");
  const [formOutcomes, setFormOutcomes]  = useState("");
  const [formTeamId, setFormTeamId]      = useState<string>(""); // "" = All teams
  const [formUserId, setFormUserId]      = useState("");
  const [formError, setFormError]        = useState<string | null>(null);

  // Teams for the team picker; users scoped to the picked team (or all).
  const { data: teams = [] } = useTeams();
  const { data: usersRaw = [] } = useUsers(formTeamId || undefined);
  const users = usersRaw as UserRow[];

  const updateMutation = useUpdateAccountabilityFunction(chartType, editingItem?.id ?? "");

  // Build a lookup of {userId → seatCount} so each card can show its own
  // "this person is in N seats" warning without re-iterating.
  const seatCountByUserId = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of insights.overloadedOwners) m.set(o.userId, o.seatCount);
    return m;
  }, [insights.overloadedOwners]);

  // Fetch org name for the table's orange header banner (matches the export).
  const [orgName, setOrgName] = useState<string>("");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/org/info");
        const json = await res.json();
        if (!cancelled && json?.success && json.data?.name) setOrgName(json.data.name);
      } catch { /* ignore — header just shows the chart title without org */ }
    })();
    return () => { cancelled = true; };
  }, []);

  function openCreate(parentFunctionId: string | null = null) {
    setEditingItem(null);
    setParentId(parentFunctionId);
    setFormName("");
    setFormDesc("");
    setFormLeading("");
    setFormOutcomes("");
    setFormTeamId("");
    setFormUserId("");
    setFormError(null);
    setShowModal(true);
  }

  function openEdit(item: FunctionRow) {
    setEditingItem(item);
    setParentId(item.parentFunctionId);
    setFormName(item.name);
    setFormDesc(item.description ?? "");
    setFormLeading(item.leadingIndicators ?? "");
    setFormOutcomes(item.expectedOutcomes ?? "");
    // Default to "All teams" when editing — keeps the existing assignee visible
    // even if they're not in any team. User can narrow with the team picker.
    setFormTeamId("");
    setFormUserId(item.assignedToUserId ?? "");
    setFormError(null);
    setShowModal(true);
  }

  // Clear the user selection whenever the team filter changes.
  // The user list refetches on the next render — re-picking forces an
  // intentional choice instead of letting a stale assignment ride.
  function handleTeamChange(newTeamId: string) {
    setFormTeamId(newTeamId);
    setFormUserId("");
  }

  async function handleSave() {
    if (!formName.trim()) { setFormError("Name is required"); return; }
    setFormError(null);
    const payload = {
      name:             formName.trim(),
      description:      formDesc.trim() || null,
      leadingIndicators: formLeading.trim() || null,
      expectedOutcomes: formOutcomes.trim() || null,
      assignedToUserId: formUserId || null,
    };
    try {
      if (editingItem) {
        await updateMutation.mutateAsync(payload);
      } else {
        await createMutation.mutateAsync({
          chartType,
          ...payload,
          parentFunctionId: parentId,
          sortOrder:        functions.length,
        });
      }
      setShowModal(false);
    } catch (e: unknown) {
      setFormError(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function handleDelete(item: FunctionRow) {
    if (!(await confirm({
      title: `Delete "${item.name}"?`,
      description: item.childFunctions.length > 0
        ? `This will also remove ${item.childFunctions.length} sub-item(s).`
        : "You can restore from the database if needed.",
      confirmLabel: "Delete",
      tone: "danger",
    }))) return;
    await deleteMutation.mutateAsync(item.id);
  }

  async function seedDefaults() {
    const items = cfg.defaultItems;
    for (let i = 0; i < items.length; i++) {
      await createMutation.mutateAsync({
        chartType,
        name: items[i],
        sortOrder: i,
      });
    }
  }

  const accentBg = cfg.accent === "violet" ? "bg-violet-100" : "bg-blue-100";
  const accentText = cfg.accent === "violet" ? "text-violet-600" : "text-blue-600";
  const accentBorderL = cfg.accent === "violet" ? "border-l-violet-400" : "border-l-blue-400";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-gray-200 bg-white flex-shrink-0">
        {cfg.backHref && (
          <Link href={cfg.backHref} className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-2 transition-colors">
            <ChevronLeft className="h-3.5 w-3.5" /> Back to Pillar Hub
          </Link>
        )}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 ${accentBg}`}>
              <Icon className={`h-4 w-4 ${accentText}`} />
            </div>
            <div>
              <h1 className="text-base font-semibold text-gray-900">{cfg.title} — {cfg.fullName}</h1>
              <p className="text-xs text-gray-500">{cfg.description}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowPreview(true)}
              disabled={functions.length === 0}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 bg-white border border-gray-200 rounded-md hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              title="See the Scaling Up book-format preview and export PDF"
            >
              <FileText className="h-3.5 w-3.5" />
              Preview / Export
            </button>
            <AddButton onClick={() => openCreate(null)}>
              Add {cfg.itemLabel}
            </AddButton>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-gray-50 p-5 min-h-0">
        {isLoading && <div className="text-sm text-gray-400 text-center py-16">Loading…</div>}

        {!isLoading && functions.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-xl">
            <EmptyState
              icon={Icon}
              title={cfg.emptyTitle}
              message={cfg.emptyMessage}
              action={{
                label: `Seed default ${cfg.itemLabel.toLowerCase()}s`,
                onClick: seedDefaults,
              }}
            />
          </div>
        )}

        {!isLoading && functions.length > 0 && (
          <div className="max-w-5xl mx-auto space-y-4">
            {/* Insight tiles */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <InsightTile
                label={`Total ${cfg.itemLabel}s`}
                value={insights.totalFunctions}
                icon={Target}
                tone="neutral"
              />
              <InsightTile
                label="Accountable"
                value={`${insights.accountableCount}/${insights.totalFunctions}`}
                icon={CheckCircle2}
                tone="positive"
              />
              <InsightTile
                label="Empty seats"
                value={insights.emptySeatsCount}
                icon={AlertCircle}
                tone={insights.emptySeatsCount > 0 ? "warning" : "neutral"}
              />
              <InsightTile
                label="Overloaded owners"
                value={insights.overloadedOwners.length}
                icon={UsersIcon}
                tone={insights.overloadedOwners.length > 0 ? "warning" : "neutral"}
                hover={insights.overloadedOwners.length > 0
                  ? insights.overloadedOwners.slice(0, 5).map((o) => `${o.firstName} ${o.lastName} (${o.seatCount} seats)`).join(" · ")
                  : undefined}
              />
            </div>

            {/* Book-format editable table (mirrors the Preview / Export sheet) */}
            <div className="bg-white rounded-xl overflow-hidden shadow-sm" style={{ border: "3px solid #F59E0B" }}>
              {/* Orange header banner */}
              <div style={{ background: "#F59E0B", color: "white", padding: "14px 18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  People: {cfg.fullName} ({cfg.title})
                </div>
                <div style={{ fontWeight: 700, fontSize: 13, letterSpacing: 0.3, maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {orgName || "Your Organisation"}
                </div>
              </div>

              {/* Table */}
              <div className="overflow-x-auto">
                <table className="w-full text-left" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#475569", color: "white" }}>
                      <th className="px-3 py-2.5 text-xs font-bold" style={{ width: "26%", border: "1px solid #cbd5e1" }}>{cfg.itemLabel}s</th>
                      <th className="px-3 py-2.5 text-xs font-bold" style={{ width: "22%", border: "1px solid #cbd5e1" }}>Person Accountable</th>
                      <th className="px-3 py-2.5 text-xs font-bold" style={{ width: "24%", border: "1px solid #cbd5e1" }}>
                        Leading Indicators
                        <div className="font-normal text-[10px] opacity-80 mt-0.5">(Key Performance Indicators)</div>
                      </th>
                      <th className="px-3 py-2.5 text-xs font-bold" style={{ width: "24%", border: "1px solid #cbd5e1" }}>
                        Results / Outcomes
                        <div className="font-normal text-[10px] opacity-80 mt-0.5">(P/L or B/S items)</div>
                      </th>
                      <th className="px-2 py-2.5 text-xs font-bold text-center" style={{ width: "4%", border: "1px solid #cbd5e1" }}>·</th>
                    </tr>
                  </thead>
                  <tbody>
                    {functions.map((item) => (
                      <FunctionTableGroup
                        key={item.id}
                        fn={item}
                        seatCountByUserId={seatCountByUserId}
                        itemLabel={cfg.itemLabel}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        onAddChild={(id) => openCreate(id)}
                      />
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <button
              onClick={() => openCreate(null)}
              className="w-full flex items-center justify-center gap-1.5 py-2.5 border border-dashed border-gray-300 rounded-xl text-xs text-gray-400 hover:border-gray-400 hover:text-gray-600 transition-colors"
            >
              <Plus className="h-3.5 w-3.5" /> Add {cfg.itemLabel}
            </button>
          </div>
        )}
      </div>

      {/* Add / Edit modal */}
      {showModal && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] flex flex-col">
            <div className="px-6 pt-5 pb-3 border-b border-gray-100 flex-shrink-0">
              <h2 className="text-sm font-semibold text-gray-900">
                {editingItem ? `Edit ${cfg.itemLabel}` : `New ${cfg.itemLabel}${parentId ? " (Sub-item)" : ""}`}
              </h2>
              <p className="text-[11px] text-gray-500 mt-0.5 italic">{cfg.accountableQuestion}</p>
            </div>
            <div className="px-6 py-4 space-y-3 flex-1 overflow-y-auto">
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Name *</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder={chartType === "face" ? "e.g. Marketing" : "e.g. Lead Generation"}
                  autoFocus
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Team</label>
                  <DropdownPicker
                    value={formTeamId}
                    onChange={handleTeamChange}
                    searchable
                    placeholder="All teams"
                    options={[
                      { value: "", label: "All teams" },
                      ...teams.map((t) => ({ value: t.id, label: t.name, hint: t.memberCount != null ? `${t.memberCount} member${t.memberCount === 1 ? "" : "s"}` : undefined })),
                    ]}
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">{cfg.accountableLabel}</label>
                  <UserPicker
                    value={formUserId}
                    onChange={setFormUserId}
                    users={users}
                    placeholder={users.length === 0 ? "No members in this team yet" : "Pick a person (empty = empty seat)"}
                    disabled={users.length === 0}
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Leading Indicators (KPIs) <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={formLeading}
                  onChange={(e) => setFormLeading(e.target.value)}
                  rows={3}
                  placeholder={"What this person tracks to drive the outcome. One per line.\n\nSales Pipeline Value, Conversion %\nFacebook likes, Cost per lead"}
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Results / Outcomes <span className="text-gray-400 font-normal">(optional · P/L or B/S items)</span>
                </label>
                <textarea
                  value={formOutcomes}
                  onChange={(e) => setFormOutcomes(e.target.value)}
                  rows={3}
                  placeholder={`${cfg.outcomesHelp}\n\nEBITDA, % of A-Players, Market Share\nNew customer acquisition`}
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">
                  Description <span className="text-gray-400 font-normal">(optional)</span>
                </label>
                <textarea
                  value={formDesc}
                  onChange={(e) => setFormDesc(e.target.value)}
                  rows={2}
                  placeholder="Short context for this function…"
                  className="w-full text-xs border border-gray-200 rounded-md px-2.5 py-1.5 resize-none focus:outline-none focus:ring-1 focus:ring-accent-400"
                />
              </div>
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
                {(createMutation.isPending || updateMutation.isPending) ? "Saving…" : editingItem ? "Save changes" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Scaling Up book-format Preview + PDF export */}
      {showPreview && (
        <AccountabilityChartPreview
          chartType={chartType}
          functions={functions}
          onClose={() => setShowPreview(false)}
        />
      )}
    </div>
  );
}

// ─── Insight tile (header strip) ─────────────────────────────────────────────

function InsightTile({
  label, value, icon: Icon, tone, hover,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  tone: "neutral" | "positive" | "warning";
  hover?: string;
}) {
  const toneCls = tone === "positive" ? "text-green-700 bg-green-50 border-green-200"
                : tone === "warning"  ? "text-amber-700 bg-amber-50 border-amber-200"
                :                        "text-gray-700 bg-white border-gray-200";
  return (
    <div className={`rounded-xl border px-4 py-3 ${toneCls}`} title={hover}>
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide opacity-80">{label}</p>
        <Icon className="h-3.5 w-3.5 opacity-60" />
      </div>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

// ─── Function card ───────────────────────────────────────────────────────────

function FunctionCard({
  item, cfg, accentBorderL, seatCountByUserId, onEdit, onDelete, onAddChild,
}: {
  item: FunctionRow;
  cfg: typeof CONFIG[ChartType];
  accentBorderL: string;
  seatCountByUserId: Map<string, number>;
  onEdit: (item: FunctionRow) => void;
  onDelete: (item: FunctionRow) => void;
  onAddChild: (parentId: string) => void;
}) {
  const isAssigned   = !!item.assignedTo;
  const seatCount    = item.assignedToUserId ? (seatCountByUserId.get(item.assignedToUserId) ?? 0) : 0;
  const isOverloaded = seatCount > 1;
  const outcomes     = (item.expectedOutcomes ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const hasChildren  = item.childFunctions.length > 0;

  return (
    <div className={`bg-white border border-gray-200 rounded-xl overflow-hidden border-l-4 ${accentBorderL} flex flex-col`}>
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-100">
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-sm font-semibold text-gray-800 flex-1 min-w-0">{item.name}</h3>
          <div className="flex items-center gap-0.5 flex-shrink-0">
            <button onClick={() => onAddChild(item.id)} title={`Add sub-${cfg.itemLabel.toLowerCase()}`} className="p-1 rounded hover:bg-gray-100 text-gray-400">
              <Plus className="h-3.5 w-3.5" />
            </button>
            <button onClick={() => onEdit(item)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
              <Pencil className="h-3 w-3" />
            </button>
            <button onClick={() => onDelete(item)} className="p-1 rounded hover:bg-red-50 text-red-400">
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
        {item.description && (
          <p className="text-[11px] text-gray-500 mt-1 leading-snug">{item.description}</p>
        )}
      </div>

      {/* Accountable person */}
      <div className="px-4 py-2.5 bg-gray-50/40">
        <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1">{cfg.accountableLabel}</p>
        {isAssigned ? (
          <div className="flex items-center gap-2">
            <div className="h-5 w-5 rounded-full bg-accent-100 flex items-center justify-center flex-shrink-0">
              <User className="h-3 w-3 text-accent-600" />
            </div>
            <span className="text-xs font-medium text-gray-700">
              {item.assignedTo!.firstName} {item.assignedTo!.lastName}
            </span>
          </div>
        ) : (
          <p className="text-xs text-amber-700 font-medium">No one accountable yet</p>
        )}
      </div>

      {/* Expected outcomes */}
      <div className="px-4 py-2.5 flex-1">
        <p className="text-[10px] uppercase tracking-wide text-gray-400 mb-1.5">{cfg.outcomesLabel}</p>
        {outcomes.length > 0 ? (
          <ul className="space-y-1">
            {outcomes.slice(0, 4).map((o, i) => (
              <li key={i} className="flex items-start gap-1.5 text-[11px] text-gray-700 leading-snug">
                <span className="text-gray-300 mt-0.5">•</span>
                <span className="flex-1">{o}</span>
              </li>
            ))}
            {outcomes.length > 4 && (
              <li className="text-[10px] text-gray-400 italic">+ {outcomes.length - 4} more</li>
            )}
          </ul>
        ) : (
          <p className="text-[11px] text-gray-400 italic">No outcomes captured yet.</p>
        )}
      </div>

      {/* System flags */}
      {(!isAssigned || isOverloaded || outcomes.length === 0) && (
        <div className="px-4 py-2 border-t border-gray-100 bg-gray-50/40 flex flex-wrap gap-1.5">
          {!isAssigned && (
            <FlagChip tone="warning">
              <AlertCircle className="h-2.5 w-2.5" /> Empty seat
            </FlagChip>
          )}
          {isOverloaded && (
            <FlagChip tone="warning">
              <UsersIcon className="h-2.5 w-2.5" /> Owner in {seatCount} seats
            </FlagChip>
          )}
          {outcomes.length === 0 && (
            <FlagChip tone="neutral">
              <AlertTriangle className="h-2.5 w-2.5" /> No outcomes
            </FlagChip>
          )}
        </div>
      )}

      {/* Sub-functions */}
      {hasChildren && (
        <div className="px-4 py-2.5 border-t border-gray-100 bg-gray-50/30 space-y-1.5">
          <p className="text-[10px] uppercase tracking-wide text-gray-400">Sub-{cfg.itemLabel.toLowerCase()}s · {item.childFunctions.length}</p>
          {item.childFunctions.map((child) => {
            const childSeats = child.assignedToUserId ? (seatCountByUserId.get(child.assignedToUserId) ?? 0) : 0;
            const childOverloaded = childSeats > 1;
            return (
              <div key={child.id} className="flex items-center gap-2 bg-white border border-gray-200 rounded-md px-2.5 py-1.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-gray-700">{child.name}</p>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {child.assignedTo
                      ? `${child.assignedTo.firstName} ${child.assignedTo.lastName}${childOverloaded ? ` · in ${childSeats} seats` : ""}`
                      : "empty seat"}
                  </p>
                </div>
                <div className="flex items-center gap-0.5">
                  <button onClick={() => onEdit(child)} className="p-1 rounded hover:bg-gray-100 text-gray-400">
                    <Pencil className="h-3 w-3" />
                  </button>
                  <button onClick={() => onDelete(child)} className="p-1 rounded hover:bg-red-50 text-red-400">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function FlagChip({ tone, children }: { tone: "warning" | "neutral"; children: React.ReactNode }) {
  const cls = tone === "warning" ? "bg-amber-100 text-amber-700 border-amber-200" : "bg-gray-100 text-gray-600 border-gray-200";
  return (
    <span className={`inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full border ${cls}`}>
      {children}
    </span>
  );
}

// ─── Book-format editable table row group ────────────────────────────────────
// Renders one parent function row + an indented row per sub-function. Every
// row has inline hover actions (add-sub on parent, edit + delete on all).

function FunctionTableGroup({
  fn, seatCountByUserId, itemLabel, onEdit, onDelete, onAddChild,
}: {
  fn: FunctionRow;
  seatCountByUserId: Map<string, number>;
  itemLabel: string;
  onEdit: (item: FunctionRow) => void;
  onDelete: (item: FunctionRow) => void;
  onAddChild: (parentId: string) => void;
}) {
  return (
    <>
      <FunctionTableRow
        fn={fn}
        seatCountByUserId={seatCountByUserId}
        indent={false}
        itemLabel={itemLabel}
        onEdit={onEdit}
        onDelete={onDelete}
        onAddChild={onAddChild}
      />
      {fn.childFunctions?.map((sub) => (
        <FunctionTableRow
          key={sub.id}
          fn={sub}
          seatCountByUserId={seatCountByUserId}
          indent
          itemLabel={itemLabel}
          onEdit={onEdit}
          onDelete={onDelete}
          onAddChild={onAddChild}
        />
      ))}
    </>
  );
}

function FunctionTableRow({
  fn, seatCountByUserId, indent, itemLabel, onEdit, onDelete, onAddChild,
}: {
  fn: FunctionRow;
  seatCountByUserId: Map<string, number>;
  indent: boolean;
  itemLabel: string;
  onEdit: (item: FunctionRow) => void;
  onDelete: (item: FunctionRow) => void;
  onAddChild: (parentId: string) => void;
}) {
  const fullName = fn.assignedTo ? `${fn.assignedTo.firstName} ${fn.assignedTo.lastName}`.trim() : "";
  const init = fn.assignedTo ? `${fn.assignedTo.firstName?.[0] ?? ""}${fn.assignedTo.lastName?.[0] ?? ""}`.toUpperCase() : "";
  const seatCount = fn.assignedToUserId ? (seatCountByUserId.get(fn.assignedToUserId) ?? 0) : 0;
  const overloaded = seatCount > 1;
  const leading = (fn.leadingIndicators ?? "").split("\n").map((l) => l.trim()).filter(Boolean);
  const outcomes = (fn.expectedOutcomes ?? "").split("\n").map((l) => l.trim()).filter(Boolean);

  return (
    <tr className="group hover:bg-amber-50/30 transition-colors">
      <td className="px-3 py-2.5 align-top" style={{ border: "1px solid #e5e7eb", paddingLeft: indent ? 28 : 12 }}>
        {indent && <span className="text-gray-300 mr-1.5">•</span>}
        <span className={`text-xs ${indent ? "font-medium text-gray-700" : "font-semibold text-gray-900"}`}>{fn.name}</span>
        {fn.description && !indent && (
          <p className="text-[10px] text-gray-400 mt-0.5 leading-snug">{fn.description}</p>
        )}
      </td>
      <td className="px-3 py-2.5 align-top" style={{ border: "1px solid #e5e7eb" }}>
        {fullName ? (
          <div className="flex items-center gap-2">
            <span className="h-6 w-6 rounded-full bg-accent-100 text-accent-700 flex items-center justify-center text-[10px] font-bold flex-shrink-0">
              {init || <User className="h-3 w-3" />}
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-medium text-gray-800 truncate">{fullName}</p>
              {overloaded && (
                <p className="text-[10px] text-amber-700">in {seatCount} seats</p>
              )}
            </div>
          </div>
        ) : (
          <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-100 border border-amber-200 px-1.5 py-0.5 rounded-full">
            <AlertCircle className="h-2.5 w-2.5" /> Empty seat
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 align-top" style={{ border: "1px solid #e5e7eb" }}>
        {leading.length > 0 ? (
          <ul className="space-y-0.5">
            {leading.map((s, i) => (
              <li key={i} className="text-[11px] text-gray-700 leading-snug flex items-start gap-1.5">
                <span className="text-gray-300 mt-0.5">•</span><span className="flex-1">{s}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-[11px] text-gray-300 italic">—</span>
        )}
      </td>
      <td className="px-3 py-2.5 align-top" style={{ border: "1px solid #e5e7eb" }}>
        {outcomes.length > 0 ? (
          <ul className="space-y-0.5">
            {outcomes.map((s, i) => (
              <li key={i} className="text-[11px] text-gray-700 leading-snug flex items-start gap-1.5">
                <span className="text-gray-300 mt-0.5">•</span><span className="flex-1">{s}</span>
              </li>
            ))}
          </ul>
        ) : (
          <span className="text-[11px] text-gray-300 italic">—</span>
        )}
      </td>
      <td className="px-1.5 py-2 align-top text-center" style={{ border: "1px solid #e5e7eb" }}>
        <div className="flex flex-col items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {!indent && (
            <button onClick={() => onAddChild(fn.id)} title={`Add sub-${itemLabel.toLowerCase()}`} className="p-1 rounded hover:bg-gray-100 text-gray-400">
              <Plus className="h-3 w-3" />
            </button>
          )}
          <button onClick={() => onEdit(fn)} title="Edit" className="p-1 rounded hover:bg-gray-100 text-gray-400">
            <Pencil className="h-3 w-3" />
          </button>
          <button onClick={() => onDelete(fn)} title="Delete" className="p-1 rounded hover:bg-red-50 text-red-400">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </td>
    </tr>
  );
}
