/**
 * Minimal className combiner — joins truthy class values with spaces.
 * Dependency-free; later classes still win via normal CSS source order, and
 * our component APIs accept a `className` prop appended last so callers can
 * override. (If we add tailwind-merge later, swap the impl here only.)
 */
export type ClassValue = string | number | false | null | undefined;

export function cn(...values: ClassValue[]): string {
  return values.filter(Boolean).join(' ');
}
