"use client";

import { ChevronDown } from "lucide-react";
import { getCountries, getCountryCallingCode } from "libphonenumber-js";
import { useEffect, useMemo, useRef, useState } from "react";
import ReactCountryFlag from "react-country-flag";

export interface PhoneValue {
  countryIso2: string;
  dialCode: string;
  number: string;
}

interface Props {
  value?: PhoneValue;
  onChange: (next: PhoneValue) => void;
  required?: boolean;
  defaultCountry?: string;
  /** Field name used by the parent for accessibility / errors. */
  ariaLabel?: string;
  /** Visual error state. */
  invalid?: boolean;
}

/** Build the country option list once at module load. ISO-2 → name + dial code. */
function buildCountryOptions(): { iso: string; dialCode: string; name: string }[] {
  const display = (typeof Intl !== "undefined" && (Intl as unknown as { DisplayNames?: typeof Intl.DisplayNames }).DisplayNames)
    ? new Intl.DisplayNames(["en"], { type: "region" })
    : null;
  const items = getCountries().map((iso) => {
    let dialCode = "";
    try {
      dialCode = `+${getCountryCallingCode(iso)}`;
    } catch {
      dialCode = "";
    }
    const name = display?.of(iso) ?? iso;
    return { iso, dialCode, name };
  });
  return items.filter((c) => c.dialCode).sort((a, b) => a.name.localeCompare(b.name));
}

const COUNTRY_OPTIONS = buildCountryOptions();

export function emptyPhoneValue(defaultCountry = "IN"): PhoneValue {
  let dialCode = "+91";
  try {
    dialCode = `+${getCountryCallingCode(defaultCountry as "IN")}`;
  } catch {
    /* default IN */
  }
  return { countryIso2: defaultCountry, dialCode, number: "" };
}

/** Build a PhoneValue from a stored E.164 string like "+919876543210". */
export function parsePhoneE164(raw: string | null | undefined, defaultCountry = "IN"): PhoneValue {
  const empty = emptyPhoneValue(defaultCountry);
  if (!raw) return empty;
  const trimmed = raw.trim();
  if (!trimmed) return empty;
  if (!trimmed.startsWith("+")) {
    return { ...empty, number: trimmed.replace(/\D+/g, "").slice(-10) };
  }
  const digits = trimmed.slice(1).replace(/\D+/g, "");
  if (digits.length < 10) return { ...empty, number: digits };
  const number = digits.slice(-10);
  const dialPart = digits.slice(0, digits.length - 10);
  // Try to find a matching country by dial code; fall back to default.
  const match = COUNTRY_OPTIONS.find((c) => c.dialCode === `+${dialPart}`);
  if (match) return { countryIso2: match.iso, dialCode: match.dialCode, number };
  return { ...empty, number };
}

/** Convert a PhoneValue back to "+<dial><10digits>" or "" if number is missing. */
export function phoneValueToE164(v: PhoneValue | undefined): string {
  if (!v || !v.number) return "";
  const digits = v.number.replace(/\D+/g, "");
  if (!digits) return "";
  return `${v.dialCode}${digits}`;
}

export function PhoneField({ value, onChange, required, defaultCountry = "IN", ariaLabel, invalid }: Props) {
  const current: PhoneValue = value ?? emptyPhoneValue(defaultCountry);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return COUNTRY_OPTIONS;
    return COUNTRY_OPTIONS.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.iso.toLowerCase().includes(q) ||
        c.dialCode.includes(q),
    );
  }, [search]);

  function pickCountry(iso: string, dialCode: string) {
    onChange({ ...current, countryIso2: iso, dialCode });
    setPickerOpen(false);
    setSearch("");
  }

  function setNumber(input: string) {
    const digits = input.replace(/\D+/g, "").slice(0, 10);
    onChange({ ...current, number: digits });
  }

  return (
    <div
      ref={wrapRef}
      className={
        "relative flex items-stretch overflow-visible rounded-lg border focus-within:border-crm-blue " +
        (invalid ? "border-red-500" : "border-crm-border")
      }
    >
      <button
        type="button"
        onClick={() => setPickerOpen((o) => !o)}
        className="flex items-center gap-1 border-r border-crm-border bg-crm-panel px-2 text-sm text-crm-text"
        aria-label="Select country"
      >
        <ReactCountryFlag countryCode={current.countryIso2} svg style={{ width: 18, height: 14 }} />
        <span className="text-crm-muted">{current.dialCode}</span>
        <ChevronDown size={12} className="text-crm-muted" />
      </button>
      <input
        type="tel"
        inputMode="numeric"
        autoComplete="tel-national"
        aria-label={ariaLabel}
        required={required}
        value={current.number}
        onChange={(e) => setNumber(e.target.value)}
        className="flex-1 bg-transparent px-3 py-2 text-sm outline-none"
        placeholder="9876543210"
        maxLength={10}
      />
      {pickerOpen && (
        <div className="absolute left-0 top-full z-30 mt-1 max-h-72 w-72 overflow-hidden rounded-lg border border-crm-border bg-white shadow-crm-dropdown">
          <div className="border-b border-crm-border p-2">
            <input
              autoFocus
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search country or code…"
              className="w-full rounded border border-crm-border px-2 py-1 text-sm outline-none focus:border-crm-blue"
            />
          </div>
          <ul className="max-h-56 overflow-auto">
            {filtered.slice(0, 200).map((c) => (
              <li key={c.iso}>
                <button
                  type="button"
                  onClick={() => pickCountry(c.iso, c.dialCode)}
                  className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm hover:bg-crm-panel"
                >
                  <ReactCountryFlag countryCode={c.iso} svg style={{ width: 18, height: 14 }} />
                  <span className="flex-1 truncate">{c.name}</span>
                  <span className="text-xs text-crm-muted">{c.dialCode}</span>
                </button>
              </li>
            ))}
            {filtered.length === 0 && (
              <li className="px-3 py-3 text-center text-xs text-crm-muted">No matches.</li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
