"use client";

import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { useToast } from "@/components/hrms/toast";
import { CrudTable, type Column } from "@/components/hrms/crud-table";
import { Modal } from "@/components/hrms/modal";
import { NumberInput } from "@/components/hrms/ui/number-input";
import { PageBackground } from "@/components/hrms/page-background";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { ListChecks } from "lucide-react";

interface JobLevel {
  id: string;
  code: string;
  name: string;
  slaDays: number;
  positionToOfferSlaDays: number | null;
  sourcedToInterviewSlaDays: number | null;
  sortOrder: number;
  isActive: boolean;
  _count: { requisitions: number };
}

const emptyForm = {
  code: "", name: "", slaDays: 15 as number | null,
  positionToOfferSlaDays: null as number | null,
  sourcedToInterviewSlaDays: null as number | null,
  sortOrder: 0 as number | null,
};

export default function JobLevelsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const { hasPermission } = useDashboardConfig();
  const canManage = hasPermission("hrms.settings.write");
  const [modal, setModal] = useState<{ open: boolean; item: JobLevel | null }>({ open: false, item: null });
  const [form, setForm] = useState(emptyForm);
  const [search, setSearch] = useState("");
  const [targetsOpen, setTargetsOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["job-levels"],
    queryFn: () => api.get<JobLevel[]>("/api/v1/hrms/settings/job-levels?includeInactive=1"),
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/settings/job-levels", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job-levels"] }); setModal({ open: false, item: null }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof form }) =>
      api.patch(`/api/v1/hrms/settings/job-levels/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["job-levels"] }); setModal({ open: false, item: null }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/settings/job-levels/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["job-levels"] }),
  });

  const columns: Column<JobLevel>[] = [
    { key: "code", label: "Code" },
    { key: "name", label: "Name" },
    { key: "slaDays", label: "Standard SLA", render: (l) => `${l.slaDays} days` },
    { key: "isActive", label: "Status", render: (l) => (
      <span className={`px-2 py-0.5 rounded-full text-[11px] font-medium ${l.isActive ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"}`}>
        {l.isActive ? "Active" : "Inactive"}
      </span>
    ) },
    { key: "_count", label: "Requisitions", render: (l) => l._count.requisitions },
  ];

  const openAdd = () => { setForm(emptyForm); setModal({ open: true, item: null }); };
  const openEdit = (item: JobLevel) => {
    setForm({
      code: item.code, name: item.name, slaDays: item.slaDays,
      positionToOfferSlaDays: item.positionToOfferSlaDays, sourcedToInterviewSlaDays: item.sourcedToInterviewSlaDays,
      sortOrder: item.sortOrder,
    });
    setModal({ open: true, item });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const body = { ...form, slaDays: form.slaDays ?? 0, sortOrder: form.sortOrder ?? 0 };
    if (modal.item) updateMut.mutate({ id: modal.item.id, body });
    else createMut.mutate(body);
  };

  const sorted = [...(data?.data ?? [])]
    .filter((l) => !search || l.name.toLowerCase().includes(search.toLowerCase()) || l.code.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.slaDays - b.slaDays);

  return (
    <>
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <CrudTable
        title="Job Levels"
        data={sorted}
        columns={columns}
        isLoading={isLoading}
        onAdd={openAdd}
        onEdit={openEdit}
        onDelete={(id) => deleteMut.mutate(id)}
        search={search}
        onSearchChange={setSearch}
        searchPlaceholder="Search job levels..."
        canManage={canManage}
        headerExtra={
          <button type="button" onClick={() => setTargetsOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-700 border border-[var(--border)] rounded-lg hover:bg-gray-50">
            <ListChecks size={13} /> Pipeline Targets
          </button>
        }
      />

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? "Edit Job Level" : "Add Job Level"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <p className="text-xs text-gray-500">
            Drives the default hiring SLA for the Recruiter Performance Dashboard — e.g. &quot;L1&quot;, 8 days.
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Code</label>
              <input type="text" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })}
                placeholder="e.g. L1, SP2" required
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Standard SLA (days)</label>
              <NumberInput allowDecimal={false} value={form.slaDays} onChange={(v) => setForm({ ...form, slaDays: v })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs" />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="e.g. Entry / Junior" required
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
          </div>
          <div className="border-t border-gray-100 pt-3">
            <p className="text-xs font-semibold text-gray-700 mb-1">Multi-Stage TAT (optional)</p>
            <p className="text-[11px] text-gray-500 mb-2">
              Per-stage SLA targets shown on Recruiter Performance. Leave blank to skip rating that stage for this level.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Position → Offer (days)</label>
                <NumberInput allowDecimal={false} value={form.positionToOfferSlaDays}
                  onChange={(v) => setForm({ ...form, positionToOfferSlaDays: v })}
                  placeholder="e.g. 20" className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Sourced → Interview (days)</label>
                <NumberInput allowDecimal={false} value={form.sourcedToInterviewSlaDays}
                  onChange={(v) => setForm({ ...form, sourcedToInterviewSlaDays: v })}
                  placeholder="e.g. 7" className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs" />
              </div>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Display Order</label>
            <NumberInput allowDecimal={false} value={form.sortOrder} onChange={(v) => setForm({ ...form, sortOrder: v })}
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs" />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal({ open: false, item: null })}
              className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">
              Cancel
            </button>
            <button type="submit" disabled={createMut.isPending || updateMut.isPending}
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
              {modal.item ? "Update" : "Create"}
            </button>
          </div>
        </form>
      </Modal>

      {targetsOpen && <PipelineTargetsModal onClose={() => setTargetsOpen(false)} />}
    </>
  );
}

interface PipelineTargetsResponse {
  stages: string[];
  levels: { id: string; code: string; name: string; targets: Record<string, number> }[];
}

/**
 * "Minimum candidates/day per stage" grid, one editable cell per
 * stage-x-level pair. Stages come live from the org's pipeline (plus the
 * fixed "Sourcing"/"Onboarding" bookends) — never hardcoded here, so a
 * renamed/added/removed pipeline stage shows up automatically next time
 * this opens.
 */
function PipelineTargetsModal({ onClose }: { onClose: () => void }) {
  const api = useApiClient();
  const qc = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["job-level-pipeline-targets"],
    queryFn: () => api.get<PipelineTargetsResponse>("/api/v1/hrms/settings/job-levels/pipeline-targets"),
  });
  const res = data?.data;

  // Local editable copy — { [levelId]: { [stage]: number|null } }. Seeded
  // from the fetched data once it arrives; every cell the grid shows gets
  // submitted on Save, so a cell cleared to blank is a real "no target".
  const [draft, setDraft] = useState<Record<string, Record<string, number | null>>>({});
  useEffect(() => {
    if (!res) return;
    setDraft(Object.fromEntries(res.levels.map((l) => [l.id, { ...l.targets }])));
  }, [res]);

  const saveMut = useMutation({
    mutationFn: () => {
      const targets: Record<string, Record<string, number>> = {};
      for (const [levelId, row] of Object.entries(draft)) {
        targets[levelId] = Object.fromEntries(
          Object.entries(row).filter((e): e is [string, number] => e[1] != null),
        );
      }
      return api.patch("/api/v1/hrms/settings/job-levels/pipeline-targets", { targets });
    },
    onSuccess: () => {
      toast.success("Pipeline targets saved");
      qc.invalidateQueries({ queryKey: ["job-level-pipeline-targets"] });
      onClose();
    },
    onError: (e: unknown) => toast.error(e instanceof Error ? e.message : "Couldn't save pipeline targets."),
  });

  const setCell = (levelId: string, stage: string, v: number | null) =>
    setDraft((d) => ({ ...d, [levelId]: { ...d[levelId], [stage]: v } }));

  return (
    <Modal open onClose={onClose} title="Pipeline Targets" size="3xl" maxWidthClass="max-w-[1100px]">
      <div className="space-y-3">
        <p className="text-xs text-gray-500">
          Minimum candidates/day per pipeline stage, by Job Level &mdash; a daily activity benchmark, not a hard rule.
          Leave a cell blank to skip tracking that stage for that level.
        </p>

        {isLoading || !res ? (
          <div className="text-center py-10 text-xs text-gray-400">Loading...</div>
        ) : res.levels.length === 0 ? (
          <p className="text-xs text-gray-400 text-center py-8">No active job levels yet.</p>
        ) : (
          <div className="border border-gray-100 rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-gray-50 text-[10.5px] uppercase tracking-wide text-gray-400">
                <tr>
                  <th className="text-left px-3 py-2 sticky left-0 bg-gray-50">Stage</th>
                  {res.levels.map((l) => (
                    <th key={l.id} className="text-center px-2 py-2 whitespace-nowrap">{l.code}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {res.stages.map((stage) => (
                  <tr key={stage}>
                    <td className="px-3 py-1.5 font-medium text-gray-700 whitespace-nowrap sticky left-0 bg-white">
                      {stage.replace(/([a-z])([A-Z])/g, "$1 $2")}
                    </td>
                    {res.levels.map((l) => (
                      <td key={l.id} className="px-2 py-1 text-center">
                        <NumberInput allowDecimal={false} min={0} max={999}
                          value={draft[l.id]?.[stage] ?? null}
                          onChange={(v) => setCell(l.id, stage, v)}
                          placeholder="—"
                          className="w-16 mx-auto border border-[var(--border)] rounded-md px-2 py-1 text-xs text-center" />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose}
            className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">
            Cancel
          </button>
          <button type="button" disabled={saveMut.isPending || isLoading} onClick={() => saveMut.mutate()}
            className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700 disabled:opacity-50">
            {saveMut.isPending ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </Modal>
  );
}
