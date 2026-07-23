"use client";

export function NumCell({
  value,
  onChange,
  available,
  unit,
}: {
  value: string;
  onChange: (v: string) => void;
  /** When provided, shows the allotted stock and warns if the entered
   *  value exceeds it. Omit to render a plain numeric cell. */
  available?: number | null;
  unit?: string;
}) {
  const hasAvail = typeof available === "number";
  const entered = parseFloat(value) || 0;
  const over = hasAvail && entered > (available as number);
  return (
    <td className="px-2 py-1.5 align-middle">
      <input
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value}
        // Block e / E / + / - so letters + exponents can't leak into the qty field.
        onKeyDown={(e) => {
          if (["e", "E", "+", "-"].includes(e.key)) e.preventDefault();
        }}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full text-xs px-2 py-1 border rounded text-right tabular-nums focus:outline-none focus:ring-1 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none ${
          over
            ? "border-red-400 bg-red-50/40 focus:ring-red-300 focus:border-red-400"
            : "border-gray-300 focus:ring-accent-300 focus:border-accent-400"
        }`}
        placeholder="0"
      />
      {hasAvail && (
        <div
          className={`mt-0.5 text-right text-[10px] ${
            over ? "font-semibold text-red-600" : "text-gray-400"
          }`}
        >
          {over
            ? `Only ${(available as number).toLocaleString("en-IN")} ${unit ?? ""} allotted here`
            : `${(available as number).toLocaleString("en-IN")} ${unit ?? ""} in stock`}
        </div>
      )}
    </td>
  );
}