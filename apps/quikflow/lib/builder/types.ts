/** A single builder step (shared between the builder page and its panels). */
export interface Step {
  id: string;
  kind: string;
  label: string;
  actionId?: string;
  // condition / if_else config
  field?: string;
  operator?: string;
  value?: string;
  value2?: string;
  unit?: string;
}
