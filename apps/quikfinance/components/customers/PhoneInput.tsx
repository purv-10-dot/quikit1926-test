"use client";

import { Input } from "@/components/ui/input";
import { DIAL_CODES, splitPhone, joinPhone } from "@/lib/phone";

/**
 * Phone field with an international dial-code dropdown + local number input.
 * `value` is the combined stored string (e.g. "+91 8717962050"); `defaultDial`
 * is used when the stored value has no code (defaults to the org's country).
 */
export function PhoneInput({
  value,
  onChange,
  defaultDial = "+91",
  placeholder = "Phone number"
}: {
  value: string;
  onChange: (combined: string) => void;
  defaultDial?: string;
  placeholder?: string;
}) {
  const { dial, number } = splitPhone(value, defaultDial);
  return (
    <div className="flex gap-2">
      <select
        className="h-10 w-24 shrink-0 rounded-md border bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring"
        value={dial}
        onChange={(e) => onChange(joinPhone(e.target.value, number))}
        aria-label="Country code"
      >
        {DIAL_CODES.map((code) => (
          <option key={code} value={code}>{code}</option>
        ))}
      </select>
      <Input value={number} placeholder={placeholder} onChange={(e) => onChange(joinPhone(dial, e.target.value))} />
    </div>
  );
}
