"use client";

import { useMemo, useState } from "react";
import { toast } from "@/lib/toast";
import { CalendarCheck, Plus, Send, CheckCircle2, RotateCcw, Download } from "lucide-react";
import {
  FormDrawer, FormSection, FormRow, Field,
  SelectInput, NumberInput, TextInput,
} from "@/components/FormDrawer";
import { PageHeader, PageContainer, PrimaryButton } from "@/components/PageShell";
import { useProjects, useContractors, useWorkmen } from "@/hooks/use-masters";
import {
  useMusters, useCreateMuster, useSubmitMuster, useApproveMuster, useReverseMuster,
  fetchMusterPrefill,
} from "@/hooks/use-muster";

const ENGAGEMENT_OPTIONS = [
  { value: "CONTRACTOR", label: "Contractor" },
  { value: "DEPARTMENTAL", label: "Departmental" },
];
const SHIFT_OPTIONS = [
  { value: "DAY", label: "Day" },
  { value: "NIGHT", label: "Night" },
];
const STATUS_STYLE: Record<string, string> = {
  APPROVED: "bg-green-50 text-green-700 border-green-200",
  SUBMITTED: "bg-amber-50 text-amber-700 border-amber-200",
  DRAFT: "bg-gray-50 text-gray-600 border-gray-200",
  REJECTED: "bg-red-50 text-red-700 border-red-200",
  REVERSED: "bg-slate-100 text-slate-500 border-slate-200",
};

const today = () => new Date().toISOString().slice(0, 10);

function StatTile({
  label, value, tone,
}: { label: string; value: number; tone: "slate" | "gray" | "amber" | "green" }) {
  const toneMap: Record<string, string> = {
    slate: "text-slate-700",
    gray: "text-gray-500",
    amber: "text-amber-600",
    green: "text-green-600",
  };
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
      <div className="text-[11px] font-medium uppercase tracking-wide text-gray-400">{label}</div>
      <div className={`mt-1 text-2xl font-bold ${toneMap[tone]}`}>{value}</div>
    </div>
  );
}

type Attendance = Record<string, { attendance: number; otHours: string }>;

export default function MusterPage() {
  const { data: projData } = useProjects();
  const { data: contractorData } = useContractors();
  const createM = useCreateMuster();
  const submitM = useSubmitMuster();
  const approveM = useApproveMuster();
  const reverseM = useReverseMuster();

  // Header selection
  const [projectId, setProjectId] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [musterDate, setMusterDate] = useState(today());
  const [engagementType, setEngagementType] = useState("CONTRACTOR");
  const [contractorId, setContractorId] = useState("");
  const [shift, setShift] = useState("DAY");
  const [attendance, setAttendance] = useState<Attendance>({});

  const { data: musterData } = useMusters(projectId ? { projectId } : undefined);
  const { data: workmenData } = useWorkmen(
    engagementType === "CONTRACTOR" && contractorId
      ? { contractorId, status: "active" }
      : engagementType === "DEPARTMENTAL"
        ? { engagementType: "DEPARTMENTAL", status: "active" }
        : undefined,
  );

  const projectOptions = (projData?.data ?? []).map((p) => ({ value: p.id, label: p.name }));
  const contractorOptions = (contractorData?.data ?? []).map((c) => ({ value: c.id, label: c.name }));
  const workmen = workmenData?.data ?? [];
  const musters = musterData?.data ?? [];

  const totals = useMemo(() => {
    const rows = Object.values(attendance);
    const present = rows.reduce((s, r) => s + (r.attendance || 0), 0);
    const ot = rows.reduce((s, r) => s + (Number(r.otHours) || 0), 0);
    return { present, ot, count: rows.filter((r) => r.attendance > 0).length };
  }, [attendance]);

  const stats = useMemo(() => {
    const by = (s: string) => musters.filter((m) => m.docStatus === s).length;
    const presentDays = musters
      .filter((m) => m.docStatus === "APPROVED")
      .reduce((sum, m) => sum + m.lines.reduce((s, l) => s + Number(l.attendance), 0), 0);
    return { total: musters.length, draft: by("DRAFT"), submitted: by("SUBMITTED"), approved: by("APPROVED"), presentDays };
  }, [musters]);

  const setAtt = (workmanId: string, val: number) =>
    setAttendance((p) => ({ ...p, [workmanId]: { attendance: val, otHours: p[workmanId]?.otHours ?? "" } }));
  const setOt = (workmanId: string, ot: string) =>
    setAttendance((p) => ({ ...p, [workmanId]: { attendance: p[workmanId]?.attendance ?? 0, otHours: ot } }));

  const openDrawer = () => {
    if (!projectId) { toast.info("Select a project first"); return; }
    setAttendance({});
    setDrawerOpen(true);
  };

  const doPrefill = async () => {
    try {
      const rows = await fetchMusterPrefill({ projectId, date: musterDate, engagementType, contractorId, shift });
      if (!rows.length) { toast.info("No approved muster yesterday to prefill from"); return; }
      const seed: Attendance = {};
      for (const r of rows) seed[r.workmanId] = { attendance: 1, otHours: "" };
      setAttendance(seed);
      toast.success(`Prefilled ${rows.length} workmen`);
    } catch { /* toast handled */ }
  };

  const save = async () => {
    if (engagementType === "CONTRACTOR" && !contractorId) { toast.error("Select a contractor"); return; }
    const lines = Object.entries(attendance)
      .filter(([, v]) => v.attendance > 0 || Number(v.otHours) > 0)
      .map(([workmanId, v]) => ({ workmanId, attendance: v.attendance, otHours: v.otHours || null }));
    if (!lines.length) { toast.error("Mark attendance for at least one workman"); return; }
    try {
      await createM.mutateAsync({
        projectId, musterDate, engagementType,
        contractorId: engagementType === "CONTRACTOR" ? contractorId : null,
        shift, lines,
      });
      setDrawerOpen(false);
    } catch { /* toast handled */ }
  };

  const onReverse = async (id: string) => {
    const reason = window.prompt("Reason for reversal (mandatory):");
    if (!reason) return;
    await reverseM.mutateAsync({ id, reason });
  };

  return (
    <>
      <PageHeader
        title="Muster Roll"
        subtitle="Daily attendance capture per project / gang"
        breadcrumbs={[{ label: "Labour" }, { label: "Muster Roll" }]}
        actions={
          <div className="flex items-center gap-2">
            <div className="w-56">
              <SelectInput value={projectId} onChange={setProjectId} options={projectOptions} placeholder="Select project" />
            </div>
            <PrimaryButton onClick={openDrawer}>
              <Plus className="w-4 h-4" /> New Muster
            </PrimaryButton>
          </div>
        }
      />
      <PageContainer>
      {projectId && musters.length > 0 && (
        <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatTile label="Total sheets" value={stats.total} tone="slate" />
          <StatTile label="Draft" value={stats.draft} tone="gray" />
          <StatTile label="Pending approval" value={stats.submitted} tone="amber" />
          <StatTile label="Approved" value={stats.approved} tone="green" />
        </div>
      )}

      {/* Muster list */}
      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-200 bg-accent-50 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="px-4 py-3 font-semibold">Muster No</th>
              <th className="px-4 py-3 font-semibold">Date</th>
              <th className="px-4 py-3 font-semibold">Engagement</th>
              <th className="px-4 py-3 font-semibold">Shift</th>
              <th className="px-4 py-3 font-semibold">Present</th>
              <th className="px-4 py-3 font-semibold">Status</th>
              <th className="px-4 py-3 text-right font-semibold">Actions</th>
            </tr>
          </thead>
          <tbody>
            {!projectId ? (
              <tr><td colSpan={7} className="px-4 py-14 text-center text-gray-400">Select a project to view its musters.</td></tr>
            ) : musters.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-14 text-center text-gray-400">No musters yet. Click “New Muster” to capture attendance.</td></tr>
            ) : musters.map((m) => {
              const present = m.lines.reduce((s, l) => s + Number(l.attendance), 0);
              return (
                <tr key={m.id} className="border-t border-gray-100 transition-colors hover:bg-blue-50/40">
                  <td className="px-4 py-3 font-semibold text-gray-900">{m.musterNo}</td>
                  <td className="px-4 py-3 text-gray-700">{m.musterDate}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      m.engagementType === "CONTRACTOR" ? "bg-indigo-50 text-indigo-700" : "bg-teal-50 text-teal-700"
                    }`}>
                      {m.engagementType === "CONTRACTOR" ? "Contractor" : "Departmental"}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700">{m.shift}</td>
                  <td className="px-4 py-3">
                    <span className="font-semibold text-gray-900">{present}</span>
                    <span className="text-gray-400"> days · {m.lines.length} workmen</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium ${STATUS_STYLE[m.docStatus] ?? STATUS_STYLE.DRAFT}`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
                      {m.docStatus}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      {(m.docStatus === "DRAFT" || m.docStatus === "REJECTED") && (
                        <button onClick={() => submitM.mutate({ id: m.id })}
                          className="inline-flex items-center gap-1 rounded-md border border-accent-200 bg-accent-50/50 px-2.5 py-1 text-xs font-medium text-accent-700 hover:bg-accent-100">
                          <Send className="w-3 h-3" /> Submit
                        </button>
                      )}
                      {m.docStatus === "SUBMITTED" && (
                        <button onClick={() => approveM.mutate({ id: m.id })}
                          className="inline-flex items-center gap-1 rounded-md border border-green-200 bg-green-50/50 px-2.5 py-1 text-xs font-medium text-green-700 hover:bg-green-100">
                          <CheckCircle2 className="w-3 h-3" /> Approve
                        </button>
                      )}
                      {m.docStatus === "APPROVED" && (
                        <button onClick={() => onReverse(m.id)}
                          className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50">
                          <RotateCcw className="w-3 h-3" /> Reverse
                        </button>
                      )}
                      {(m.docStatus === "REVERSED" || m.docStatus === "REJECTED") && (
                        <span className="text-xs text-gray-300">—</span>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
        </div>
      </div>
      </PageContainer>

      {/* New muster drawer */}
      <FormDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)}
        title="New Muster" subtitle="Mark daily attendance"
        onSubmit={save} loading={createM.isPending} submitLabel="Save Draft">
        <FormSection title="Sheet">
          <FormRow>
            <Field label="Date" required>
              <TextInput type="date" value={musterDate} onChange={setMusterDate} />
            </Field>
            <Field label="Shift">
              <SelectInput value={shift} onChange={setShift} options={SHIFT_OPTIONS} />
            </Field>
          </FormRow>
          <FormRow>
            <Field label="Engagement" required>
              <SelectInput value={engagementType} onChange={(v) => { setEngagementType(v); setAttendance({}); }} options={ENGAGEMENT_OPTIONS} />
            </Field>
            {engagementType === "CONTRACTOR" && (
              <Field label="Contractor" required>
                <SelectInput value={contractorId} onChange={(v) => { setContractorId(v); setAttendance({}); }}
                  options={contractorOptions} placeholder="Select contractor" />
              </Field>
            )}
          </FormRow>
          <button type="button" onClick={doPrefill}
            className="inline-flex items-center gap-1.5 rounded-md border border-gray-200 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
            <Download className="w-3.5 h-3.5" /> Prefill from yesterday
          </button>
        </FormSection>

        <FormSection title={`Attendance · ${totals.count} present · ${totals.present} days · ${totals.ot} OT hrs`}>
          {workmen.length === 0 ? (
            <p className="text-sm text-gray-400 py-4">
              {engagementType === "CONTRACTOR" && !contractorId
                ? "Select a contractor to load its workmen."
                : "No active workmen found for this gang."}
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[46vh] overflow-y-auto pr-1">
              {workmen.map((w) => {
                const a = attendance[w.id]?.attendance ?? 0;
                return (
                  <div key={w.id} className="flex items-center gap-2 rounded-lg border border-gray-100 px-3 py-2">
                    <div className="flex-1 min-w-0">
                      <div className="truncate text-sm font-medium text-gray-900">{w.fullName}</div>
                      <div className="truncate text-xs text-gray-400">{w.workmanCode} · {w.categoryName ?? "—"}</div>
                    </div>
                    <div className="inline-flex rounded-md bg-gray-100 p-0.5">
                      {([["P", 1], ["H", 0.5], ["A", 0]] as const).map(([lbl, val]) => (
                        <button key={lbl} type="button" onClick={() => setAtt(w.id, val)}
                          className={`w-8 rounded px-0 py-1 text-xs font-semibold ${
                            a === val ? "bg-white text-accent-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
                          }`}>
                          {lbl}
                        </button>
                      ))}
                    </div>
                    <div className="w-16">
                      <NumberInput value={attendance[w.id]?.otHours ?? ""} onChange={(v) => setOt(w.id, v)} placeholder="OT" min={0} max={8} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </FormSection>
      </FormDrawer>
    </>
  );
}
