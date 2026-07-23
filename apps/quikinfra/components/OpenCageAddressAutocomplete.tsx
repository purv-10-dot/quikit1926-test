"use client";

import { MapPin } from "lucide-react";

const INPUT_WRAP =
  "w-full rounded-lg border border-gray-300 text-sm focus-within:ring-2 focus-within:ring-accent-500 focus-within:border-transparent";
const INPUT_INNER =
  "w-full border-0 bg-transparent py-2 pl-10 pr-3 text-sm text-gray-900 placeholder:text-gray-400 focus:outline-none focus:ring-0";

export type AddressSuggestionPick = {
  formatted: string;
  state: string | null;
  city: string | null;
  cityMatched: boolean;
};

type Props = {
  value: string | null | undefined;
  onChange: (next: string) => void;
  // Kept for call-site compatibility while OpenCage autocomplete is disabled.
  // Address suggestions are turned off, so this never fires; users type the
  // address manually and pick state/city from the dropdowns next to this field.
  onSuggestionPick?: (pick: AddressSuggestionPick) => void;
  placeholder?: string;
  disabled?: boolean;
};

// OpenCage address autocomplete is disabled for now. This renders a plain
// text input so the address field keeps working without hitting the
// /api/geo/opencage endpoint. To re-enable, restore this file from git
// history (it previously debounced queries against the geocoding route).
export function OpenCageAddressAutocomplete({
  value,
  onChange,
  placeholder = "Enter address",
  disabled,
}: Props) {
  return (
    <div className="relative">
      <div
        className={`relative flex items-center bg-white ${INPUT_WRAP} ${
          disabled ? "pointer-events-none bg-gray-50 opacity-60" : ""
        }`}
      >
        <MapPin
          className="pointer-events-none absolute left-3 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-gray-400"
          aria-hidden
        />
        <input
          type="text"
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck={false}
          className={INPUT_INNER}
        />
      </div>
    </div>
  );
}
