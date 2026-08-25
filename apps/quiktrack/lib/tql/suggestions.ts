/**
 * Static autocomplete data for the TQL editor's field suggestion dropdown.
 * Built from lib/tql/fields.ts (the translator's own source of truth) so
 * suggestions can never include a field the engine doesn't actually parse.
 */
import { NATIVE_FIELDS, type NativeFieldKind } from "./fields";

export interface FieldSuggestion {
  /** What gets inserted, e.g. "assignee" or 'cf["Customer Tier"]'. */
  insertText: string;
  /** What's shown in the dropdown row, e.g. "assignee" or "Customer Tier". */
  label: string;
  /** Short operator hint shown alongside the label. */
  hint: string;
  kind: "native" | "customField";
}

const KIND_OPERATOR_HINT: Record<NativeFieldKind, string> = {
  equality: "=, !=, IN, NOT IN, IS EMPTY",
  text: "~, !~",
  textSearch: "~, !~",
  date: "=, !=, >, <, >=, <=",
  link: "IN, NOT IN",
  attachment: "IS EMPTY, IS NOT EMPTY",
};

/** One suggestion per canonical field (aliases collapse to their canonical name). */
export const NATIVE_FIELD_SUGGESTIONS: FieldSuggestion[] = Object.values(NATIVE_FIELDS)
  .sort((a, b) => a.name.localeCompare(b.name))
  .map((spec) => ({
    insertText: spec.name,
    label: spec.name,
    hint: KIND_OPERATOR_HINT[spec.kind],
    kind: "native",
  }));

export function customFieldSuggestion(name: string): FieldSuggestion {
  return {
    insertText: `cf["${name}"]`,
    label: name,
    hint: "custom field",
    kind: "customField",
  };
}
