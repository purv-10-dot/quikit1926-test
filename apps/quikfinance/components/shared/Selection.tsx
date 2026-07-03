"use client";

export function CheckboxCell({ checked, onChange }: { checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <input
      type="checkbox"
      checked={checked}
      onChange={(event) => onChange(event.target.checked)}
      className="h-4 w-4 rounded border-input accent-sky-600"
      aria-label="Select row"
    />
  );
}
