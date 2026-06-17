import type { TicketPriority } from "@quikit/database";

export interface SlaHours {
  responseHours: number;
  resolveHours: number;
}

interface CategoryLike {
  slaResponseHours: number;
  slaResolveHours: number;
  slaMatrix: unknown;
}

interface MatrixEntry {
  responseHours?: number;
  resolveHours?: number;
}

type RawMatrix = Partial<Record<TicketPriority, MatrixEntry>>;

function isMatrix(v: unknown): v is RawMatrix {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

/**
 * Resolve SLA hours for a ticket given its category and priority.
 * Priority override (slaMatrix) wins; falls back to flat category hours
 * when matrix is null or the priority entry is missing/incomplete.
 */
export function resolveSla(category: CategoryLike, priority: TicketPriority): SlaHours {
  const raw = category.slaMatrix;
  if (!isMatrix(raw)) {
    return {
      responseHours: category.slaResponseHours,
      resolveHours: category.slaResolveHours,
    };
  }
  const entry = raw[priority];
  return {
    responseHours:
      typeof entry?.responseHours === "number" && entry.responseHours > 0
        ? entry.responseHours
        : category.slaResponseHours,
    resolveHours:
      typeof entry?.resolveHours === "number" && entry.resolveHours > 0
        ? entry.resolveHours
        : category.slaResolveHours,
  };
}

/** Fallback SLA for department-based tickets that aren't tied to a category. */
export const DEFAULT_SLA: SlaHours = { responseHours: 24, resolveHours: 72 };

export function computeSlaDates(
  category: CategoryLike | null,
  priority: TicketPriority,
  from: Date,
): { slaResponseDueAt: Date; slaResolveDueAt: Date } {
  const { responseHours, resolveHours } = category ? resolveSla(category, priority) : DEFAULT_SLA;
  return {
    slaResponseDueAt: new Date(from.getTime() + responseHours * 60 * 60 * 1000),
    slaResolveDueAt: new Date(from.getTime() + resolveHours * 60 * 60 * 1000),
  };
}
