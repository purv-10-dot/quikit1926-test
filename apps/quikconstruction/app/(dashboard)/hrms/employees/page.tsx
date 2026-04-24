"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { AddButton, EmptyState, SlidePanel, Button, Input, Select, Field, FormRow, FormSection } from "@quikit/ui";
import { Users, ArrowLeft, Pencil } from "lucide-react";
import { TableSkeleton } from "@/components/ui/Skeleton";

interface Emp {
  id: string; empCode: string; firstName: string; lastName: string | null;
  email: string | null; phone: string | null; designation: string | null; empType: string;
  monthlyWage: string | null; dailyWage: string | null; hourlyWage: string | null; status: string;
  department: { name: string } | null;
}
interface Dept { id: string; name: string }

const TYPE_LABEL: Record<string, string> = { permanent: "Permanent", contract: "Contract", daily_wage: "Daily Wage" };

export default function EmployeesPage() {
  const [items, setItems] = useState<Emp[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [form, setForm] = useState<Record<string, string | number | null>>({});
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    const r = await fetch("/api/hrms/employees"); const j = await r.json();
    if (j.success) setItems(j.data); setLoading(false);
  }, []);
  useEffect(() => { refresh(); fetch("/api/masters/departments").then(r => r.json()).then(j => j.success && setDepts(j.data)); }, [refresh]);

  function openNew() {
    setEditingId(null);
    setForm({ empCode: "", firstName: "", lastName: "", email: "", phone: "", designation: "", departmentId: "", empType: "permanent", monthlyWage: "", dailyWage: "", hourlyWage: "" });
    setErr(null); setOpen(true);
  }
  function openEdit(e: Emp) {
    setEditingId(e.id);
    setForm({
      empCode: e.empCode, firstName: e.firstName, lastName: e.lastName ?? "", email: e.email ?? "", phone: e.phone ?? "",
      designation: e.designation ?? "", departmentId: "", empType: e.empType,
      monthlyWage: e.monthlyWage ?? "", dailyWage: e.dailyWage ?? "", hourlyWage: e.hourlyWage ?? "",
    });
    setErr(null); setOpen(true);
  }

  async function save() {
    setBusy(true); setErr(null);
    try {
      const body: Record<string, unknown> = {
        empCode: form.empCode, firstName: form.firstName, lastName: form.lastName || null,
        email: form.email || null, phone: form.phone || null, designation: form.designation || null,
        departmentId: form.departmentId || null, empType: form.empType,
        monthlyWage: form.monthlyWage ? Number(form.monthlyWage) : null,
        dailyWage: form.dailyWage ? Number(form.dailyWage) : null,
        hourlyWage: form.hourlyWage ? Number(form.hourlyWage) : null,
      };
      const url = editingId ? `/api/hrms/employees/${editingId}` : "/api/hrms/employees";
      const r = await fetch(url, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const j = await r.json();
      if (!j.success) throw new Error(j.error ?? "Save failed");
      setOpen(false); refresh();
    } catch (e: unknown) {
      setErr(e instanceof Error ? e.message : "Save failed");
    } finally { setBusy(false); }
  }

  return (
    <div className="p-6 max-w-6xl">
      <Link href="/hrms" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-gray-800 mb-3"><ArrowLeft className="h-3 w-3" /> HRMS</Link>
      <div className="flex items-center justify-between mb-4">
        <div><h1 className="text-lg font-semibold text-gray-900">Employees</h1><p className="text-xs text-gray-500">Permanent, contract, and daily wage staff.</p></div>
        <AddButton onClick={openNew}>Add Employee</AddButton>
      </div>
      {loading ? <TableSkeleton rows={5} cols={6} /> : items.length === 0 ? (
        <EmptyState icon={Users} title="No employees yet" message="Start by adding staff to your organization." />
      ) : (
        <div className="rounded-lg border border-gray-200 bg-white overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-accent-50 text-xs text-gray-600"><tr>
              <th className="text-left px-3 py-2">Code</th><th className="text-left px-3 py-2">Name</th>
              <th className="text-left px-3 py-2">Designation</th><th className="text-left px-3 py-2">Department</th>
              <th className="text-left px-3 py-2">Type</th><th className="text-right px-3 py-2">Wage</th>
              <th style={{ width: 50 }}></th>
            </tr></thead>
            <tbody>{items.map(e => {
              const wage = e.monthlyWage ? `₹${e.monthlyWage}/mo` : e.dailyWage ? `₹${e.dailyWage}/day` : e.hourlyWage ? `₹${e.hourlyWage}/hr` : "—";
              return (
                <tr key={e.id} className="border-t border-gray-100 hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-xs">{e.empCode}</td>
                  <td className="px-3 py-2 text-gray-900">{e.firstName} {e.lastName ?? ""}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{e.designation ?? "—"}</td>
                  <td className="px-3 py-2 text-xs text-gray-500">{e.department?.name ?? "—"}</td>
                  <td className="px-3 py-2 text-xs">{TYPE_LABEL[e.empType] ?? e.empType}</td>
                  <td className="px-3 py-2 text-right text-xs text-gray-700">{wage}</td>
                  <td className="px-3 py-2"><button onClick={() => openEdit(e)} className="text-gray-400 hover:text-accent-600 p-1"><Pencil className="h-3.5 w-3.5" /></button></td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      )}

      <SlidePanel size="lg" open={open} onClose={() => setOpen(false)} title={editingId ? "Edit Employee" : "Add Employee"}
        footer={<><Button variant="secondary" onClick={() => setOpen(false)} disabled={busy}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></>}>
        <div className="space-y-5">
          {err && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
          <FormSection title="Identity">
            <FormRow cols={2}>
              <Field label="Emp Code" required><Input value={String(form.empCode ?? "")} onChange={e => setForm({ ...form, empCode: e.target.value.toUpperCase() })} /></Field>
              <Field label="Designation"><Input value={String(form.designation ?? "")} onChange={e => setForm({ ...form, designation: e.target.value })} /></Field>
            </FormRow>
            <FormRow cols={2}>
              <Field label="First Name" required><Input value={String(form.firstName ?? "")} onChange={e => setForm({ ...form, firstName: e.target.value })} /></Field>
              <Field label="Last Name"><Input value={String(form.lastName ?? "")} onChange={e => setForm({ ...form, lastName: e.target.value })} /></Field>
            </FormRow>
            <FormRow cols={2}>
              <Field label="Email"><Input type="email" value={String(form.email ?? "")} onChange={e => setForm({ ...form, email: e.target.value })} /></Field>
              <Field label="Phone"><Input value={String(form.phone ?? "")} onChange={e => setForm({ ...form, phone: e.target.value })} /></Field>
            </FormRow>
            <Field label="Department">
              <Select value={String(form.departmentId ?? "")} onChange={e => setForm({ ...form, departmentId: e.target.value })}
                options={depts.map(d => ({ value: d.id, label: d.name }))} placeholder="— none —" />
            </Field>
          </FormSection>
          <FormSection title="Wage">
            <Field label="Employment Type">
              <Select value={String(form.empType ?? "permanent")} onChange={e => setForm({ ...form, empType: e.target.value })}
                options={[{ value: "permanent", label: "Permanent (monthly)" }, { value: "daily_wage", label: "Daily Wage" }, { value: "contract", label: "Contract (hourly)" }]} />
            </Field>
            <FormRow cols={3}>
              <Field label="Monthly ₹"><Input type="number" step="1" value={String(form.monthlyWage ?? "")} onChange={e => setForm({ ...form, monthlyWage: e.target.value })} /></Field>
              <Field label="Daily ₹"><Input type="number" step="1" value={String(form.dailyWage ?? "")} onChange={e => setForm({ ...form, dailyWage: e.target.value })} /></Field>
              <Field label="Hourly ₹"><Input type="number" step="1" value={String(form.hourlyWage ?? "")} onChange={e => setForm({ ...form, hourlyWage: e.target.value })} /></Field>
            </FormRow>
          </FormSection>
        </div>
      </SlidePanel>
    </div>
  );
}
