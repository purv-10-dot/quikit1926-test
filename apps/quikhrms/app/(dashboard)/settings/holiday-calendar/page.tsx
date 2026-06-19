"use client";

import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Modal } from "@/components/hrms/modal";
import { Select } from "@/components/hrms/ui/select";
import { useDialog } from "@/components/hrms/dialog";
import {
  Plus, Calendar, CalendarDays, Trash2, Edit2,
  Type as TypeIcon, FileText, Tag, Globe, MapPin, Building2, Star,
  Repeat, Bell, X as XIcon, Users,
} from "lucide-react";
import { clsx } from "clsx";
import { SkeletonTable } from "@/components/hrms/skeleton";

interface Holiday {
  id: string;
  name: string;
  date: string;
  year: number;
  type: "National" | "Regional" | "Company" | "Optional";
  isOptional: boolean;
  maxOptionalAllowed: number | null;
  applicableDepartments: string[] | null;
  applicableLocations: string[] | null;
  description: string | null;
}

interface DepartmentItem { id: string; name: string }
interface LocationItem { id: string; name: string; city: string | null }

interface HolidayForm {
  name: string;
  date: string;
  type: Holiday["type"];
  isOptional: boolean;
  description: string;
  applicableDepartments: string[];
  applicableLocations: string[];
  repeatsYearly: boolean;
  repeatYears: number;
  notifyEmployees: boolean;
}

const EMPTY_FORM: HolidayForm = {
  name: "",
  date: "",
  type: "National",
  isOptional: false,
  description: "",
  applicableDepartments: [],
  applicableLocations: [],
  repeatsYearly: false,
  repeatYears: 5,
  notifyEmployees: false,
};

const HOLIDAY_TYPES = ["National", "Regional", "Company", "Optional"] as const;
const typeColors: Record<string, string> = {
  National: "bg-red-100 text-red-700",
  Regional: "bg-[#dbeafe] text-[#2563eb]",
  Company: "bg-green-100 text-green-700",
  Optional: "bg-yellow-100 text-yellow-700",
};

interface TypeMeta {
  label: string;
  description: string;
  icon: LucideIcon;
  ring: string;
  activeRing: string;
  iconBg: string;
  iconColor: string;
  badge: string;
}

const TYPE_META: Record<typeof HOLIDAY_TYPES[number], TypeMeta> = {
  National: {
    label: "National",
    description: "Recognized nationwide",
    icon: Globe,
    ring: "ring-gray-200",
    activeRing: "ring-2 ring-red-500 bg-red-50/50",
    iconBg: "bg-red-100",
    iconColor: "text-red-600",
    badge: "bg-red-100 text-red-700",
  },
  Regional: {
    label: "Regional",
    description: "Specific to a state or area",
    icon: MapPin,
    ring: "ring-gray-200",
    activeRing: "ring-2 ring-blue-500 bg-blue-50/50",
    iconBg: "bg-blue-100",
    iconColor: "text-blue-600",
    badge: "bg-[#dbeafe] text-[#2563eb]",
  },
  Company: {
    label: "Company",
    description: "Internal observance",
    icon: Building2,
    ring: "ring-gray-200",
    activeRing: "ring-2 ring-green-500 bg-green-50/50",
    iconBg: "bg-green-100",
    iconColor: "text-green-600",
    badge: "bg-green-100 text-green-700",
  },
  Optional: {
    label: "Optional",
    description: "Employees may choose",
    icon: Star,
    ring: "ring-gray-200",
    activeRing: "ring-2 ring-yellow-500 bg-yellow-50/50",
    iconBg: "bg-yellow-100",
    iconColor: "text-yellow-600",
    badge: "bg-yellow-100 text-yellow-700",
  },
};

export default function HolidayCalendarPage() {
  const api = useApiClient();
  const dialog = useDialog();
  const qc = useQueryClient();
  const [year, setYear] = useState(new Date().getFullYear());
  const [showModal, setShowModal] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [form, setForm] = useState<HolidayForm>(EMPTY_FORM);

  const { data, isLoading } = useQuery({
    queryKey: ["holidays", year],
    queryFn: () => api.get<Holiday[]>(`/api/v1/hrms/settings/holidays?year=${year}&limit=100`),
  });

  const { data: deptsData } = useQuery({
    queryKey: ["departments-lite"],
    queryFn: () => api.get<DepartmentItem[]>("/api/v1/hrms/departments?limit=200"),
    staleTime: 5 * 60_000,
    enabled: showModal,
  });
  const departments = deptsData?.data ?? [];

  const { data: locsData } = useQuery({
    queryKey: ["locations-lite"],
    queryFn: () => api.get<LocationItem[]>("/api/v1/hrms/locations?limit=200"),
    staleTime: 5 * 60_000,
    enabled: showModal,
  });
  const locations = locsData?.data ?? [];

  const createMut = useMutation({
    mutationFn: (body: HolidayForm) => api.post("/api/v1/hrms/settings/holidays", body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      qc.invalidateQueries({ queryKey: ["home", "holidays-upcoming"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "batch"] });
      setShowModal(false);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, body }: { id: string; body: HolidayForm }) => api.put(`/api/v1/hrms/settings/holidays/${id}`, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      qc.invalidateQueries({ queryKey: ["home", "holidays-upcoming"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "batch"] });
      setShowModal(false);
      setEditId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/hrms/settings/holidays/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["holidays"] });
      qc.invalidateQueries({ queryKey: ["home", "holidays-upcoming"] });
      qc.invalidateQueries({ queryKey: ["dashboard", "batch"] });
    },
  });

  const openCreate = () => {
    setEditId(null);
    setForm(EMPTY_FORM);
    setShowModal(true);
  };

  const openEdit = (h: Holiday) => {
    setEditId(h.id);
    setForm({
      name: h.name,
      date: h.date.slice(0, 10),
      type: h.type,
      isOptional: h.isOptional,
      description: h.description ?? "",
      applicableDepartments: h.applicableDepartments ?? [],
      applicableLocations: h.applicableLocations ?? [],
      repeatsYearly: false,
      repeatYears: 5,
      notifyEmployees: false,
    });
    setShowModal(true);
  };

  const holidays = data?.data ?? [];

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <Calendar className="text-[#3b82f6]" />
          <h1 className="font-serif-display text-3xl md:text-4xl font-bold text-gray-900">Holiday Calendar</h1>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={String(year)}
            onChange={(v) => setYear(Number(v))}
            options={[year - 1, year, year + 1, year + 2].map((y) => ({ value: String(y), label: String(y) }))}
            className="w-28"
          />
          <button onClick={openCreate}
            className="flex items-center gap-2 btn btn-primary">
            <Plus size={16} /> Add Holiday
          </button>
        </div>
      </div>

      {isLoading ? <SkeletonTable rows={6} cols={4} /> : holidays.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8 text-center text-gray-500">
          <Calendar size={32} className="mx-auto mb-2 text-gray-300" /> No holidays for {year}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="text-left px-4 py-3">Date</th>
                <th className="text-left px-4 py-3">Holiday</th>
                <th className="text-left px-4 py-3">Type</th>
                <th className="text-left px-4 py-3">Optional</th>
                <th className="text-right px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {holidays.map((h) => (
                <tr key={h.id} className="text-sm">
                  <td className="px-4 py-3 font-mono text-gray-700">{new Date(h.date).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</td>
                  <td className="px-4 py-3 font-medium text-gray-900">{h.name}{h.description && <div className="text-xs text-gray-500 font-normal">{h.description}</div>}</td>
                  <td className="px-4 py-3"><span className={clsx("px-2 py-0.5 rounded-full text-xs font-medium", typeColors[h.type])}>{h.type}</span></td>
                  <td className="px-4 py-3 text-gray-600">{h.isOptional ? "Yes" : "No"}</td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => openEdit(h)} className="text-[#3b82f6] hover:text-[#1d4ed8] mr-3"><Edit2 size={14} /></button>
                    <button onClick={async () => {
                      const ok = await dialog.confirm({
                        title: "Delete holiday?",
                        description: `"${h.name}" will be permanently removed from the calendar.`,
                        variant: "danger",
                        confirmLabel: "Delete",
                      });
                      if (ok) deleteMut.mutate(h.id);
                    }} className="text-red-500 hover:text-red-700"><Trash2 size={14} /></button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Modal
        open={showModal}
        onClose={() => setShowModal(false)}
        title={editId ? "Edit Holiday" : "Add Holiday"}
        subtitle={editId ? "Update the details below" : "Mark a day as a recognized holiday for your organization"}
        headerIcon={<CalendarDays size={20} />}
        size="lg"
        bodyClassName="overflow-y-auto"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (editId) updateMut.mutate({ id: editId, body: form });
            else createMut.mutate(form);
          }}
        >
          <div className="p-6 space-y-5">
            {/* Live preview */}
            <HolidayPreview form={form} />

            {/* Name + Date row */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  <TypeIcon size={12} className="text-gray-400" />
                  Name <span className="text-red-500 normal-case">*</span>
                </label>
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. Diwali, Independence Day"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#16243A]/20 focus:border-[#16243A] transition-all"
                />
              </div>
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                  <Calendar size={12} className="text-gray-400" />
                  Date <span className="text-red-500 normal-case">*</span>
                </label>
                <input
                  type="date"
                  required
                  value={form.date}
                  onChange={(e) => setForm({ ...form, date: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#16243A]/20 focus:border-[#16243A] transition-all"
                />
              </div>
            </div>

            {/* Type — visual chip selector */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide mb-2">
                <Tag size={12} className="text-gray-400" />
                Type <span className="text-red-500 normal-case">*</span>
              </label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
                {HOLIDAY_TYPES.map((t) => {
                  const meta = TYPE_META[t];
                  const Icon = meta.icon;
                  const active = form.type === t;
                  return (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setForm({ ...form, type: t })}
                      className={clsx(
                        "relative flex flex-col items-start gap-1.5 p-3 rounded-xl ring-1 text-left transition-all",
                        active ? meta.activeRing : `${meta.ring} hover:ring-gray-300 hover:bg-gray-50`,
                      )}
                    >
                      <div className={clsx("w-7 h-7 rounded-lg flex items-center justify-center", meta.iconBg)}>
                        <Icon size={14} className={meta.iconColor} />
                      </div>
                      <div className="text-[13px] font-semibold text-gray-900">{meta.label}</div>
                      <div className="text-[11px] text-gray-500 leading-tight">{meta.description}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Applies to — Departments */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                <Users size={12} className="text-gray-400" />
                Applies to departments <span className="text-gray-400 normal-case font-normal">(leave empty for all)</span>
              </label>
              <ChipMultiSelect
                placeholder="All departments"
                options={departments.map((d) => ({ value: d.id, label: d.name }))}
                value={form.applicableDepartments}
                onChange={(v) => setForm({ ...form, applicableDepartments: v })}
              />
            </div>

            {/* Applies to — Locations */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                <MapPin size={12} className="text-gray-400" />
                Applies to locations <span className="text-gray-400 normal-case font-normal">(leave empty for all)</span>
              </label>
              <ChipMultiSelect
                placeholder="All locations"
                options={locations.map((l) => ({ value: l.id, label: l.city ? `${l.name} · ${l.city}` : l.name }))}
                value={form.applicableLocations}
                onChange={(v) => setForm({ ...form, applicableLocations: v })}
              />
            </div>

            {/* Switch panel: Optional + Repeats + Notify */}
            <div className="rounded-xl bg-gray-50 ring-1 ring-gray-100 divide-y divide-gray-200/70">
              <SwitchRow
                title="Optional holiday"
                hint="Employees can choose whether to observe this day. Floater leaves typically use this."
                checked={form.isOptional}
                onChange={(v) => setForm({ ...form, isOptional: v })}
              />
              <div>
                <SwitchRow
                  icon={<Repeat size={14} className="text-gray-500" />}
                  title="Repeats yearly"
                  hint="Add this holiday for the next several years automatically."
                  checked={form.repeatsYearly}
                  onChange={(v) => setForm({ ...form, repeatsYearly: v })}
                  disabled={!!editId}
                />
                {form.repeatsYearly && !editId && (
                  <div className="px-4 pb-3 -mt-1 flex items-center gap-3 text-xs text-gray-600">
                    <span>Create for the next</span>
                    <select
                      value={form.repeatYears}
                      onChange={(e) => setForm({ ...form, repeatYears: Number(e.target.value) })}
                      className="border border-gray-300 rounded-md px-2 py-1 text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[#16243A]/20"
                    >
                      {[2, 3, 5, 7, 10].map((n) => (
                        <option key={n} value={n}>{n}</option>
                      ))}
                    </select>
                    <span>years</span>
                  </div>
                )}
              </div>
              <SwitchRow
                icon={<Bell size={14} className="text-gray-500" />}
                title="Notify employees"
                hint={editId ? "Notifications were sent when this holiday was first created." : "Send an in-app notification to everyone this holiday applies to."}
                checked={form.notifyEmployees}
                onChange={(v) => setForm({ ...form, notifyEmployees: v })}
                disabled={!!editId}
              />
            </div>

            {/* Description */}
            <div>
              <label className="flex items-center gap-1.5 text-xs font-semibold text-gray-700 uppercase tracking-wide mb-1.5">
                <FileText size={12} className="text-gray-400" />
                Description <span className="text-gray-400 normal-case font-normal">(optional)</span>
              </label>
              <textarea
                rows={3}
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                placeholder="Add context, observance notes, or applicable departments…"
                className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-[#16243A]/20 focus:border-[#16243A] transition-all resize-none"
              />
            </div>
          </div>

          {/* Sticky footer */}
          <div className="flex items-center justify-end gap-2 px-6 py-3.5 border-t border-gray-100 bg-gray-50/60">
            <button
              type="button"
              onClick={() => setShowModal(false)}
              className="px-4 py-2 border border-gray-300 bg-white rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMut.isPending || updateMut.isPending}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-[#16243A] text-white rounded-lg text-sm font-semibold hover:bg-[#2563eb] disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
            >
              {(createMut.isPending || updateMut.isPending) && (
                <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" />
              )}
              {editId ? "Save changes" : "Create holiday"}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function HolidayPreview({ form }: { form: HolidayForm }) {
  const meta = TYPE_META[form.type];
  const Icon = meta.icon;
  const hasData = form.name || form.date;

  const dateLabel = form.date
    ? new Date(form.date).toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric",
      })
    : "Pick a date";

  const scopeLabel = (() => {
    const d = form.applicableDepartments.length;
    const l = form.applicableLocations.length;
    if (d === 0 && l === 0) return "All employees";
    const parts: string[] = [];
    if (d) parts.push(`${d} department${d > 1 ? "s" : ""}`);
    if (l) parts.push(`${l} location${l > 1 ? "s" : ""}`);
    return parts.join(" · ");
  })();

  return (
    <div className="relative overflow-hidden rounded-xl ring-1 ring-gray-100 bg-gradient-to-br from-gray-50 to-white p-4">
      <div className="absolute top-2 right-3 text-[10px] font-semibold uppercase tracking-wider text-gray-400">
        Preview
      </div>
      <div className="flex items-center gap-3.5">
        <div className={clsx("w-12 h-12 rounded-xl flex items-center justify-center shrink-0", meta.iconBg)}>
          <Icon size={20} className={meta.iconColor} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-bold text-gray-900 truncate">
              {form.name || <span className="text-gray-400 font-medium">Holiday name</span>}
            </p>
            <span className={clsx("px-2 py-0.5 rounded-full text-[10px] font-semibold", meta.badge)}>
              {meta.label}
            </span>
            {form.isOptional && (
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-amber-50 text-amber-700 ring-1 ring-amber-100">
                Optional
              </span>
            )}
            {form.repeatsYearly && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-50 text-indigo-700 ring-1 ring-indigo-100">
                <Repeat size={9} /> {form.repeatYears}y
              </span>
            )}
            {form.notifyEmployees && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-blue-50 text-blue-700 ring-1 ring-blue-100">
                <Bell size={9} /> Notify
              </span>
            )}
          </div>
          <p className={clsx("text-xs mt-0.5", hasData ? "text-gray-600" : "text-gray-400")}>
            {dateLabel}
          </p>
          <p className="text-[11px] text-gray-500 mt-0.5 flex items-center gap-1">
            <Users size={10} /> {scopeLabel}
          </p>
        </div>
      </div>
    </div>
  );
}

function SwitchRow({
  title,
  hint,
  checked,
  onChange,
  icon,
  disabled,
}: {
  title: string;
  hint: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon?: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <div className={clsx("flex items-start justify-between gap-4 p-4", disabled && "opacity-60")}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
          {icon}
          {title}
        </div>
        <p className="text-xs text-gray-500 mt-0.5">{hint}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={clsx(
          "relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#16243A]/30",
          checked ? "bg-[#16243A]" : "bg-gray-300",
          disabled && "cursor-not-allowed",
        )}
      >
        <span
          className={clsx(
            "inline-block h-5 w-5 transform rounded-full bg-white shadow-sm transition-transform mt-0.5",
            checked ? "translate-x-5" : "translate-x-0.5",
          )}
        />
      </button>
    </div>
  );
}

function ChipMultiSelect({
  options,
  value,
  onChange,
  placeholder,
}: {
  options: { value: string; label: string }[];
  value: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const selected = options.filter((o) => value.includes(o.value));
  const available = options.filter(
    (o) => !value.includes(o.value) && o.label.toLowerCase().includes(query.toLowerCase()),
  );

  const toggle = (v: string) => {
    if (value.includes(v)) onChange(value.filter((x) => x !== v));
    else onChange([...value, v]);
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={clsx(
          "w-full min-h-[42px] flex flex-wrap items-center gap-1.5 border border-gray-300 rounded-lg px-2.5 py-1.5 text-sm bg-white text-left transition-all",
          open && "ring-2 ring-[#16243A]/20 border-[#16243A]",
          !open && "hover:border-gray-400",
        )}
      >
        {selected.length === 0 && (
          <span className="text-gray-400 px-1">{placeholder}</span>
        )}
        {selected.map((o) => (
          <span
            key={o.value}
            className="inline-flex items-center gap-1 pl-2 pr-1 py-0.5 bg-[#16243A]/5 text-[#16243A] rounded-md text-xs font-medium"
          >
            {o.label}
            <span
              role="button"
              tabIndex={-1}
              onClick={(e) => { e.stopPropagation(); toggle(o.value); }}
              className="p-0.5 rounded hover:bg-[#16243A]/15 cursor-pointer"
              aria-label={`Remove ${o.label}`}
            >
              <XIcon size={10} />
            </span>
          </span>
        ))}
      </button>

      {open && (
        <div className="absolute z-50 left-0 right-0 mt-1 bg-white rounded-lg ring-1 ring-gray-200 shadow-lg overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search…"
              className="w-full text-sm px-2 py-1.5 focus:outline-none"
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {available.length === 0 ? (
              <div className="px-3 py-2 text-xs text-gray-400">
                {options.length === 0 ? "Nothing to choose" : query ? "No matches" : "All selected"}
              </div>
            ) : (
              available.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => { toggle(o.value); setQuery(""); }}
                  className="w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50"
                >
                  {o.label}
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
