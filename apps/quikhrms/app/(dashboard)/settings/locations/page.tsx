"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { CrudTable, type Column } from "@/components/hrms/crud-table";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { PageBackground } from "@/components/hrms/page-background";
import { useDashboardConfig } from "@/lib/hooks/use-dashboard-config";
import { CITIES } from "@/lib/data/cities";

/** Same composite-key pattern as the city dropdown itself — keeps same-named
 * cities in different states/countries distinct (e.g. two "Springfield"s). */
const cityKey = (c: { city: string; state: string; country: string }) => `${c.city}|${c.state}|${c.country}`;

interface Loc {
  id: string;
  name: string;
  city: string | null;
  state: string | null;
  country: string | null;
  timezone: string | null;
  isHeadquarter: boolean;
  _count: { employees: number };
}

export default function LocationsPage() {
  const api = useApiClient();
  const qc = useQueryClient();
  const { hasPermission } = useDashboardConfig();
  const canManage = hasPermission("hrms.org.write");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const PAGE_SIZE = 10;
  const [modal, setModal] = useState<{ open: boolean; item: Loc | null }>({ open: false, item: null });
  const [form, setForm] = useState({ name: "", city: "", state: "", country: "", timezone: "", isHeadquarter: false });

  const { data, isLoading } = useQuery({
    queryKey: ["locations", search],
    queryFn: () => api.get<Loc[]>(`/api/v1/hrms/locations?limit=100${search ? `&search=${search}` : ""}`),
  });

  const createMut = useMutation({
    mutationFn: (body: typeof form) => api.post("/api/v1/hrms/locations", body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["locations"] }); setModal({ open: false, item: null }); },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: typeof form }) => api.patch(`/api/v1/hrms/locations/${id}`, body),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["locations"] }); setModal({ open: false, item: null }); },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/locations/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["locations"] }),
  });

  const columns: Column<Loc>[] = [
    { key: "name", label: "Name" },
    { key: "city", label: "City", render: (l) => l.city ?? "—" },
    { key: "country", label: "Country", render: (l) => l.country ?? "—" },
    { key: "isHeadquarter", label: "HQ", render: (l) => l.isHeadquarter ? "Yes" : "No" },
    { key: "_count", label: "Employees", render: (l) => l._count.employees },
  ];

  const openAdd = () => { setForm({ name: "", city: "", state: "", country: "", timezone: "", isHeadquarter: false }); setModal({ open: true, item: null }); };
  const openEdit = (item: Loc) => { setForm({ name: item.name, city: item.city ?? "", state: item.state ?? "", country: item.country ?? "", timezone: item.timezone ?? "", isHeadquarter: item.isHeadquarter }); setModal({ open: true, item }); };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    modal.item ? updateMut.mutate({ id: modal.item.id, body: form }) : createMut.mutate(form);
  };

  return (
    <>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      <CrudTable title="Office Locations" data={(data?.data ?? []).slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)} columns={columns} isLoading={isLoading}
        onAdd={openAdd} onEdit={openEdit} onDelete={(id) => deleteMut.mutate(id)}
        search={search} onSearchChange={(v) => { setSearch(v); setPage(1); }} searchPlaceholder="Search locations..."
        pagination={{ page, totalPages: Math.max(1, Math.ceil((data?.data ?? []).length / PAGE_SIZE)), total: (data?.data ?? []).length, limit: PAGE_SIZE, onPageChange: setPage }}
        canManage={canManage} />

      <Modal open={modal.open} onClose={() => setModal({ open: false, item: null })} title={modal.item ? "Edit Location" : "Add Location"}>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
            <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required
              className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">City</label>
              <Select
                value={form.city ? cityKey({ city: form.city, state: form.state, country: form.country }) : ""}
                onChange={(v) => {
                  const rec = CITIES.find((c) => cityKey(c) === v);
                  if (rec) setForm({ ...form, city: rec.city, state: rec.state, country: rec.country, timezone: rec.timezone });
                }}
                searchable
                placeholder="Search city..."
                options={CITIES.map((c) => ({ value: cityKey(c), label: c.city, description: `${c.state}, ${c.country}` }))}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
              <input type="text" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Country</label>
              <input type="text" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Timezone</label>
              <input type="text" value={form.timezone} onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                className="w-full border border-[var(--border)] rounded-lg px-3 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <input type="checkbox" id="hq" checked={form.isHeadquarter} onChange={(e) => setForm({ ...form, isHeadquarter: e.target.checked })}
              className="rounded border-gray-300" />
            <label htmlFor="hq" className="text-sm text-gray-700">Headquarter</label>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={() => setModal({ open: false, item: null })}
              className="px-3 py-1.5 border border-[var(--border)] rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50">Cancel</button>
            <button type="submit"
              className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:bg-green-700">
              {modal.item ? "Update" : "Create"}</button>
          </div>
        </form>
      </Modal>
    </>
  );
}
