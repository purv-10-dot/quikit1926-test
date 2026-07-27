"use client";

import { useMemo, useRef, useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { CrudTable, type Column } from "@/components/hrms/crud-table";
import { Modal } from "@/components/hrms/modal";
import { PageBackground } from "@/components/hrms/page-background";
import { CITIES } from "@/lib/data/cities";
import { ChevronDown, MapPin } from "lucide-react";

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
  const [search, setSearch] = useState("");
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
      <CrudTable title="Office Locations" data={data?.data ?? []} columns={columns} isLoading={isLoading}
        onAdd={openAdd} onEdit={openEdit} onDelete={(id) => deleteMut.mutate(id)}
        search={search} onSearchChange={setSearch} searchPlaceholder="Search locations..." />

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
              <CityAutocomplete
                value={form.city}
                onChange={(city) => setForm({ ...form, city })}
                onSelect={(rec) => setForm({
                  ...form,
                  city: rec.city, state: rec.state, country: rec.country, timezone: rec.timezone,
                })}
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

function CityAutocomplete({
  value, onChange, onSelect,
}: {
  value: string;
  onChange: (v: string) => void;
  onSelect: (r: typeof CITIES[number]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return CITIES.slice(0, 12);
    return CITIES.filter((c) =>
      c.city.toLowerCase().includes(q) ||
      c.state.toLowerCase().includes(q) ||
      c.country.toLowerCase().includes(q)
    ).slice(0, 20);
  }, [query]);

  return (
    <div className="relative" ref={ref}>
      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder="Search city..."
          className="w-full border border-[var(--border)] rounded-lg pl-3 pr-8 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-[#166534]"
        />
        <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>
      {open && matches.length > 0 && (
        <div className="absolute z-50 top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-lg max-h-64 overflow-auto">
          {matches.map((r) => (
            <button
              type="button"
              key={`${r.city}-${r.state}-${r.country}`}
              onClick={() => { onSelect(r); setQuery(r.city); setOpen(false); }}
              className="w-full flex items-start gap-2 px-3 py-2 text-left hover:bg-[#dcfce7]"
            >
              <MapPin size={14} className="text-[#22c55e] mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-xs font-medium text-gray-900">{r.city}</div>
                <div className="text-[11px] text-gray-500 truncate">{r.state} · {r.country} · {r.timezone}</div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
