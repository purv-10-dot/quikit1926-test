"use client";

import { useEffect, useMemo, useState } from "react";
import { Download, CalendarDays, AlertTriangle } from "lucide-react";
import {
  FormDrawer,
  Field,
  TextInput,
  NumberInput,
  DateInput,
  CheckboxInput,
  SelectInput,
} from "@/components/FormDrawer";
import { PrimaryButton, SecondaryButton } from "@/components/PageShell";
import { useProjects } from "@/hooks/use-masters";
import { useWorkOrders, useCreateRAB, pullRABLines } from "@/hooks/use-projects";
import { computeRABill } from "@/lib/rab/compute";

const inr = (n: number) =>
  "₹ " + Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 });

interface LineRow {
  boqItemId: string;
  boqNo: string;
  description: string;
  unit: string;
  uomId: string;
  rate: string;
  billableQty: string;
  billQty: string;
  amount: string;
  capped: boolean;
}

interface DprSource {
  id: string;
  dprNumber: string;
  reportDate: string;
}

export function GenerateRABillForm({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}) {
  const { data: projectsData } = useProjects();
  const projectOptions = (projectsData?.data ?? []).map((p: any) => ({
    value: p.id,
    label: p.name,
  }));

  const [projectId, setProjectId] = useState("");
  const [contractorId, setContractorId] = useState("");
  const [woRef, setWoRef] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [source, setSource] = useState<"dpr" | "boq">("dpr");

  const [lines, setLines] = useState<LineRow[]>([]);
  const [sources, setSources] = useState<DprSource[]>([]);
  const [cappedLines, setCappedLines] = useState(0);
  const [pullMsg, setPullMsg] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);

  const [retentionPercent, setRetentionPercent] = useState("5");
  const [tdsRate, setTdsRate] = useState("1");
  const [gstRate, setGstRate] = useState("18");
  const [interState, setInterState] = useState(false);

  const createRAB = useCreateRAB();

  // Reset the whole form each time the drawer is opened fresh.
  useEffect(() => {
    if (!open) return;
    setProjectId("");
    setContractorId("");
    setWoRef("");
    setFrom("");
    setTo("");
    setSource("dpr");
    setLines([]);
    setSources([]);
    setCappedLines(0);
    setPullMsg(null);
  }, [open]);

  // WOs for the selected project → contractor list + WO reference cascade.
  const { data: woData } = useWorkOrders(projectId ? { projectId } : undefined);
  const wos: any[] = projectId ? woData?.data ?? [] : [];

  const contractorOptions = useMemo(() => {
    const seen = new Map<string, string>();
    for (const w of wos) {
      if (w.contractorId && !seen.has(w.contractorId)) {
        seen.set(w.contractorId, w.contractorName ?? w.contractorId);
      }
    }
    return Array.from(seen, ([value, label]) => ({ value, label }));
  }, [wos]);

  // Selecting a contractor auto-fills the WO reference with that
  // project+contractor's most recent work order.
  useEffect(() => {
    if (!contractorId) {
      setWoRef("");
      return;
    }
    const wo = wos.find((w) => w.contractorId === contractorId);
    setWoRef(wo?.woNumber ?? "");
  }, [contractorId, wos]);

  function handleProjectChange(v: string) {
    setProjectId(v);
    setContractorId("");
    setWoRef("");
    setLines([]);
    setSources([]);
    setCappedLines(0);
    setPullMsg(null);
  }

  async function handlePull() {
    setPullMsg(null);
    if (!projectId) {
      setPullMsg("Select a project first.");
      return;
    }
    if (source === "dpr" && (!from || !to)) {
      setPullMsg("Set the bill period (from and to) to pull from DPRs.");
      return;
    }
    setPulling(true);
    try {
      const res = await pullRABLines(source, { projectId, from, to });
      const rows: LineRow[] = (res.lines ?? []).map((l: any) => ({
        boqItemId: l.boqItemId,
        boqNo: l.boqNo,
        description: l.description ?? "",
        unit: l.unit ?? "",
        uomId: l.uomId ?? "",
        rate: String(l.rate ?? "0"),
        billableQty: String(l.billableQty ?? "0"),
        billQty: String(l.billQty ?? l.billableQty ?? "0"),
        amount: String(l.amount ?? "0"),
        capped: !!l.capped,
      }));
      setLines(rows);
      setSources(res.sources ?? []);
      setCappedLines(res.cappedLines ?? 0);
      if (rows.length === 0) {
        setPullMsg(
          source === "dpr" && res.noDprs
            ? "No approved DPRs in this period."
            : "No billable balance — all reported progress is already billed.",
        );
      }
    } catch (e: any) {
      setPullMsg(e?.message ?? "Failed to pull lines.");
    } finally {
      setPulling(false);
    }
  }

  // Live deduction waterfall — client-side reuse of the server function.
  const computed = useMemo(() => {
    const cgstRate = interState ? 0 : Number(gstRate) / 2;
    const sgstRate = interState ? 0 : Number(gstRate) / 2;
    const igstRate = interState ? Number(gstRate) : 0;
    return computeRABill({
      lines: lines.map((l) => ({ currentAmount: l.amount })),
      retentionPercent,
      tdsRate,
      cgstRate,
      sgstRate,
      igstRate,
    });
  }, [lines, retentionPercent, tdsRate, gstRate, interState]);

  const billableLineCount = lines.filter((l) => Number(l.billQty) > 0).length;

  const canGenerate =
    !!projectId &&
    !!contractorId &&
    !!from &&
    !!to &&
    billableLineCount > 0 &&
    computed.gross > 0 &&
    !createRAB.isPending;

  async function handleGenerate() {
    const cgstRate = interState ? 0 : Number(gstRate) / 2;
    const sgstRate = interState ? 0 : Number(gstRate) / 2;
    const igstRate = interState ? Number(gstRate) : 0;
    const payload = {
      projectId,
      contractorId,
      woRef: woRef || undefined,
      billType: "ra_bill",
      billPeriodFrom: from,
      billPeriodTo: to,
      retentionPercent: Number(retentionPercent) || 0,
      tdsRate: Number(tdsRate) || 0,
      cgstRate,
      sgstRate,
      igstRate,
      lines: lines
        .filter((l) => Number(l.billQty) > 0)
        .map((l) => ({
          boqItemId: l.boqItemId,
          currentQty: Number(l.billQty),
          uomId: l.uomId,
          description: l.description,
        })),
    };
    await createRAB.mutateAsync(payload);
    onCreated();
  }

  return (
    <FormDrawer
      open={open}
      onClose={onClose}
      title="Generate RA Bill"
      subtitle="Bill the progress reported on approved DPRs for a period"
      width="4xl"
      footer={
        <>
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleGenerate} disabled={!canGenerate}>
            {createRAB.isPending ? "Generating…" : "Generate RAB"}
          </PrimaryButton>
        </>
      }
    >
      <div className="space-y-5">
        {/* Project / Contractor */}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Project" required>
            <SelectInput
              value={projectId}
              onChange={handleProjectChange}
              options={projectOptions}
              placeholder="Select project"
              searchable
            />
          </Field>
          <Field label="Contractor" required>
            <SelectInput
              value={contractorId}
              onChange={setContractorId}
              options={contractorOptions}
              placeholder={projectId ? "Select contractor" : "Select a project first"}
              disabled={!projectId}
            />
          </Field>
        </div>

        {/* WO ref / period */}
        <div className="grid grid-cols-3 gap-4">
          <Field label="WO Reference">
            <TextInput value={woRef} onChange={setWoRef} placeholder="Work order number (optional)" />
          </Field>
          <Field label="Period From" required>
            <DateInput value={from} onChange={setFrom} max={to || undefined} />
          </Field>
          <Field label="Period To" required>
            <DateInput value={to} onChange={setTo} min={from || undefined} />
          </Field>
        </div>

        {/* Source toggle + pull */}
        <div className="rounded-lg border border-gray-200 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex overflow-hidden rounded-lg border border-gray-200">
              <button
                type="button"
                onClick={() => setSource("dpr")}
                className={`flex items-center gap-2 px-4 py-2 text-sm ${source === "dpr" ? "bg-orange-600 text-white" : "bg-gray-50 text-gray-700"}`}
              >
                <CalendarDays size={15} /> From DPRs (period)
              </button>
              <button
                type="button"
                onClick={() => setSource("boq")}
                className={`flex items-center gap-2 px-4 py-2 text-sm ${source === "boq" ? "bg-orange-600 text-white" : "bg-gray-50 text-gray-700"}`}
              >
                From BOQ (cumulative)
              </button>
            </div>
            <button
              type="button"
              onClick={handlePull}
              disabled={!projectId || pulling}
              className="flex items-center gap-2 rounded-lg border border-orange-600 px-4 py-2 text-sm font-medium text-orange-700 hover:bg-orange-50 disabled:opacity-50"
            >
              <Download size={15} />
              {pulling ? "Pulling…" : source === "dpr" ? "Pull from approved DPRs" : "Pull from BOQ"}
            </button>
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {source === "dpr"
              ? "Sums today's qty from approved DPRs in the period, capped to the un-billed balance so the same work is never billed twice."
              : "Pulls the cumulative un-billed balance (executed − billed) from the BOQ."}
          </p>
          {pullMsg && <p className="mt-2 text-xs text-amber-600">{pullMsg}</p>}
        </div>

        {/* Capped warning + source chips */}
        {cappedLines > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-700">
            <AlertTriangle size={15} />
            {cappedLines} line{cappedLines > 1 ? "s were" : " was"} capped to the un-billed balance.
          </div>
        )}
        {sources.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-gray-500">Source DPRs:</span>
            {sources.map((s) => (
              <span key={s.id} className="rounded-full bg-orange-100 px-2.5 py-0.5 text-xs text-orange-700">
                {s.dprNumber} · {s.reportDate}
              </span>
            ))}
          </div>
        )}

        {/* Lines table */}
        {lines.length > 0 && (
          <div className="overflow-hidden rounded-xl border border-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-orange-50 text-left text-[11px] uppercase tracking-wide text-gray-600">
                  <th className="px-3 py-2.5 font-semibold">BOQ No</th>
                  <th className="px-3 py-2.5 font-semibold">Description</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Billable</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Bill Qty</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Rate</th>
                  <th className="px-3 py-2.5 text-right font-semibold">Amount</th>
                </tr>
              </thead>
              <tbody>
                {lines.map((l) => (
                  <tr key={l.boqItemId} className="border-t border-gray-100 transition-colors hover:bg-gray-50/70">
                    <td className="px-3 py-2.5 align-top">
                      <span className="font-semibold text-gray-900">{l.boqNo}</span>
                      {l.capped && (
                        <span className="ml-1.5 rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
                          capped
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 align-top text-gray-600">
                      <span className="line-clamp-2">{l.description}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums text-gray-500">
                      {l.billableQty} {l.unit}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top">
                      <span className="inline-block rounded-md bg-gray-100 px-2 py-1 font-semibold tabular-nums text-gray-900">
                        {l.billQty} {l.unit}
                      </span>
                    </td>
                    <td className="px-3 py-2.5 text-right align-top tabular-nums text-gray-700">
                      {inr(Number(l.rate))}
                    </td>
                    <td className="px-3 py-2.5 text-right align-top font-semibold tabular-nums text-gray-900">
                      {inr(Number(l.amount))}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t border-gray-200 bg-gray-50">
                  <td colSpan={5} className="px-3 py-2.5 text-right font-medium text-gray-600">
                    Gross
                  </td>
                  <td className="px-3 py-2.5 text-right font-bold tabular-nums text-gray-900">
                    {inr(computed.gross)}
                  </td>
                </tr>
              </tfoot>
            </table>
            <p className="border-t border-gray-100 bg-white px-3 py-2 text-[11px] text-gray-400">
              Bill quantity is fixed to the clamped billable balance — it can never exceed work that's executed but not yet billed.
            </p>
          </div>
        )}

        {/* Deductions */}
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <Field label="Retention %">
            <NumberInput value={retentionPercent} onChange={setRetentionPercent} />
          </Field>
          <Field label="TDS %">
            <NumberInput value={tdsRate} onChange={setTdsRate} />
          </Field>
          <Field label="GST %">
            <NumberInput value={gstRate} onChange={setGstRate} />
          </Field>
          <Field label="GST Type">
            <div className="py-2">
              <CheckboxInput checked={interState} onChange={setInterState} label="Inter-state (IGST)" />
            </div>
          </Field>
        </div>

        {/* Live summary */}
        <div className="rounded-lg bg-gray-50 p-4 text-sm">
          <Row label={`Gross (${billableLineCount} line${billableLineCount === 1 ? "" : "s"})`} value={inr(computed.gross)} />
          {computed.gstTotal > 0 && <Row label="Add: GST" value={`+ ${inr(computed.gstTotal)}`} />}
          {computed.totalDeductions > 0 && <Row label="Less: Deductions (retention, TDS, etc.)" value={`− ${inr(computed.totalDeductions)}`} />}
          <div className="mt-2 flex items-center justify-between border-t border-gray-200 pt-2 text-base font-semibold">
            <span>Net Payable</span>
            <span className="text-orange-700">{inr(computed.netPayable)}</span>
          </div>
        </div>
      </div>
    </FormDrawer>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-gray-500">{label}</span>
      <span className="text-gray-900">{value}</span>
    </div>
  );
}
