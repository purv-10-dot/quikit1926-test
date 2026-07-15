"use client";

import {
  BarChart3,
  Target,
  Tag,
  TrendingUp,
  Workflow,
  MessageSquare,
  CheckSquare,
  AtSign,
  Clock,
  CalendarDays,
  Link2,
  Type as TypeIcon,
  AlignLeft,
  type LucideIcon,
} from "lucide-react";
import { K } from "./ideas-types";
import type { FieldDef } from "./ideas-types";

/**
 * Single source of truth for a column's leading icon, keyed by column key or
 * field type. Used by the table header AND the Fields side panel so both stay in
 * sync. The computed Score ("RICE score") uses an `fx` text glyph, handled by the
 * caller — this returns a LucideIcon fallback for it.
 */
export function iconForColumn(key: string, field?: FieldDef): LucideIcon {
  // Special / system columns by key.
  if (key === "summary") return TypeIcon;
  if (key === "insights") return TrendingUp;
  if (key === "comments") return MessageSquare;
  if (key === "delivery") return Workflow;
  if (key === "assignee" || key === "creator") return AtSign;
  if (key === "created" || key === "updated") return Clock;
  if (key === "status") return Target;

  // Discovery field keys with a bespoke look.
  switch (key) {
    case K.theme: return Tag;
    case K.impact:
    case K.effort:
    case K.reach:
    case K.value: return BarChart3;
    case K.roadmap: return Target;
  }

  // By field type.
  switch (field?.type) {
    case "CHECKBOX": return CheckSquare;
    case "URL": return Link2;
    case "DATE": return CalendarDays;
    case "NUMBER": return BarChart3;
    case "LONG_TEXT": return AlignLeft;
    case "LABELS": return Tag;
    case "DROPDOWN_SINGLE":
    case "DROPDOWN_MULTI": return Target;
    default: return Tag;
  }
}

/** True when a column should render the `fx` glyph instead of a lucide icon. */
export function isFormulaColumn(field?: FieldDef): boolean {
  return field?.key === K.score;
}
