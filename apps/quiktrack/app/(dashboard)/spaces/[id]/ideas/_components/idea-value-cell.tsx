"use client";

import {
  type FieldDef,
  type IdeaFieldValue,
  K,
  RATING_DOTS,
  ROADMAP_STYLES,
  chipStyle,
  optionLabel,
} from "./ideas-types";

/** 1–5 rating rendered as filled/empty dots (Impact, Effort). */
function RatingDots({ value, max, fill }: { value: number; max: number; fill: string }) {
  const filled = Math.max(0, Math.min(max, Math.round(value)));
  return (
    <div className="flex items-center gap-1">
      {Array.from({ length: max }).map((_, i) => (
        <span
          key={i}
          className={`h-2 w-2 rounded-full ${i < filled ? fill : "bg-gray-200"}`}
        />
      ))}
    </div>
  );
}

function Pill({ label, className }: { label: string; className: string }) {
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${className}`}>
      {label}
    </span>
  );
}

/**
 * Renders one idea field value read-only for the Table view. The seeded scoring
 * keys (impact/effort dots, roadmap pill, confidence %) get bespoke cells;
 * everything else uses a generic renderer keyed off the field type.
 */
export function IdeaValueCell({ field, value }: { field: FieldDef; value: IdeaFieldValue }) {
  const blank = value === null || value === undefined || value === "" ||
    (Array.isArray(value) && value.length === 0);

  // Rating dots (Impact / Effort) — always show the 5-dot track even when empty.
  const rating = RATING_DOTS[field.key];
  if (rating) {
    return <RatingDots value={blank ? 0 : Number(value)} max={rating.max} fill={rating.fill} />;
  }

  if (blank) return <span className="text-gray-300">—</span>;

  // Roadmap pill (Now / Next / Later / Won't do).
  if (field.key === K.roadmap && typeof value === "string") {
    return <Pill label={optionLabel(field, value)} className={ROADMAP_STYLES[value] ?? "bg-gray-100 text-gray-600"} />;
  }

  // Confidence shows a percent suffix; Score / Reach / other numbers plain.
  if (field.type === "NUMBER") {
    const n = Number(value);
    const suffix = field.key === K.confidence ? "%" : "";
    const text = field.key === K.score ? n.toFixed(2) : String(n);
    return <span className="tabular-nums text-gray-800">{text}{suffix}</span>;
  }

  if (field.type === "DROPDOWN_SINGLE" && typeof value === "string") {
    return <Pill label={optionLabel(field, value)} className={chipStyle(value)} />;
  }

  if ((field.type === "DROPDOWN_MULTI" || field.type === "LABELS") && Array.isArray(value)) {
    return (
      <div className="flex flex-wrap gap-1">
        {value.map((v) => (
          <Pill key={v} label={optionLabel(field, v)} className={chipStyle(v)} />
        ))}
      </div>
    );
  }

  if (field.type === "CHECKBOX") {
    return <span className="text-gray-800">{value ? "Yes" : "No"}</span>;
  }

  return <span className="truncate text-gray-800">{String(value)}</span>;
}
