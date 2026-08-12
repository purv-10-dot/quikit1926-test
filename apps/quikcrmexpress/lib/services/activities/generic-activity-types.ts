/** User-selectable types for the Generic tab of Log activity (Salesforce-style). */
export const GENERIC_ACTIVITY_TYPES = [
  "Note",
  "Call",
  "Email",
  "Meeting",
  "Task",
] as const;

export type GenericActivityType = (typeof GENERIC_ACTIVITY_TYPES)[number];

export function isGenericActivityType(v: string): v is GenericActivityType {
  return (GENERIC_ACTIVITY_TYPES as readonly string[]).includes(v);
}
