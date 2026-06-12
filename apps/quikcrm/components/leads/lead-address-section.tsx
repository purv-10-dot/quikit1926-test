"use client";

import { ChevronDown } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ISO_COUNTRIES } from "@/lib/utils/iso-countries";
import { INDIAN_STATES } from "@/lib/utils/indian-states";

export interface LeadAddressValues {
  country: string;
  addressLine2: string;
  addressLine1: string;
  cityName: string;
  stateName: string;
  postalCode: string;
  lat: string;
  long: string;
}

interface LeadAddressSectionProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  values: LeadAddressValues;
  onChange: <K extends keyof LeadAddressValues>(key: K, value: LeadAddressValues[K]) => void;
  errors: Partial<Record<keyof LeadAddressValues, string>>;
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-crm-text">{label}</span>
      {children}
      {error && <span className="mt-1 block text-[11px] text-red-600">{error}</span>}
    </label>
  );
}

export function LeadAddressSection({
  open,
  onOpenChange,
  values,
  onChange,
  errors,
}: LeadAddressSectionProps) {
  return (
    <details
      open={open}
      onToggle={(e) => onOpenChange((e.currentTarget as HTMLDetailsElement).open)}
      className="group rounded-lg border border-crm-border"
    >
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm font-medium text-crm-text marker:content-none [&::-webkit-details-marker]:hidden">
        <span>Address Information</span>
        <ChevronDown
          className="h-4 w-4 shrink-0 text-crm-muted transition-transform group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="space-y-4 border-t border-crm-border px-4 pb-4 pt-3">
        <Field label="Country / Region" error={errors.country}>
          <Select value={values.country} onChange={(e) => onChange("country", e.target.value)}>
            <option value="">—None—</option>
            {ISO_COUNTRIES.map((c) => (
              <option key={c.code} value={c.name}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Flat / House No./ Building / Apartment Name" error={errors.addressLine2}>
          <Input
            value={values.addressLine2}
            onChange={(e) => onChange("addressLine2", e.target.value)}
          />
        </Field>

        <Field label="Street Address" error={errors.addressLine1}>
          <Input value={values.addressLine1} onChange={(e) => onChange("addressLine1", e.target.value)} />
        </Field>

        <Field label="City" error={errors.cityName}>
          <Input value={values.cityName} onChange={(e) => onChange("cityName", e.target.value)} />
        </Field>

        <Field label="State / Province" error={errors.stateName}>
          <Select value={values.stateName} onChange={(e) => onChange("stateName", e.target.value)}>
            <option value="">—None—</option>
            {INDIAN_STATES.map((s) => (
              <option key={s.code} value={s.name}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Zip / Postal Code" error={errors.postalCode}>
          <Input value={values.postalCode} onChange={(e) => onChange("postalCode", e.target.value)} />
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-crm-text">Coordinates</span>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <Input
                value={values.lat}
                onChange={(e) => onChange("lat", e.target.value)}
                placeholder="Latitude"
                inputMode="decimal"
              />
              {errors.lat && <span className="mt-1 block text-[11px] text-red-600">{errors.lat}</span>}
            </div>
            <div>
              <Input
                value={values.long}
                onChange={(e) => onChange("long", e.target.value)}
                placeholder="Longitude"
                inputMode="decimal"
              />
              {errors.long && <span className="mt-1 block text-[11px] text-red-600">{errors.long}</span>}
            </div>
          </div>
        </div>
      </div>
    </details>
  );
}
