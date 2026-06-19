import { useEffect, useRef } from "react";
import {
  ChevronsUp,
  ChevronUp,
  Equal,
  ChevronDown as ChevronDownArrow,
  ChevronsDown,
} from "lucide-react";
import type { Priority } from "./types";

/**
 * Shared, presentation-only helpers for the issue field controls (details
 * panel + subtask grid): priority metadata, avatar colour/initials, and the
 * outside-click hook. Kept separate so the component files stay under the
 * 300 LOC ceiling.
 */

export interface FieldMember {
  userId: string;
  user: { firstName: string | null; lastName: string | null; email: string } | null;
}

export const PRIORITY_META: Record<
  Priority,
  { label: string; color: string; Icon: React.ElementType }
> = {
  HIGHEST: { label: "Highest", color: "text-red-600", Icon: ChevronsUp },
  HIGH: { label: "High", color: "text-red-500", Icon: ChevronUp },
  MEDIUM: { label: "Medium", color: "text-amber-500", Icon: Equal },
  LOW: { label: "Low", color: "text-blue-500", Icon: ChevronDownArrow },
  LOWEST: { label: "Lowest", color: "text-blue-400", Icon: ChevronsDown },
};

export function avatarColor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}deg 45% 50%)`;
}

export function userInitials(u: FieldMember["user"]) {
  if (!u) return "?";
  const f = (u.firstName ?? "").trim();
  const l = (u.lastName ?? "").trim();
  return ((f[0] ?? "") + (l[0] ?? "")).toUpperCase() || (u.email[0] ?? "?").toUpperCase();
}

export function memberName(u: FieldMember["user"]) {
  if (!u) return "Unassigned";
  return `${u.firstName ?? ""} ${u.lastName ?? ""}`.trim() || u.email;
}

export function useOutsideClose<T extends HTMLElement>(open: boolean, onClose: () => void) {
  const ref = useRef<T | null>(null);
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, onClose]);
  return ref;
}
