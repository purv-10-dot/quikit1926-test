export const ACCOUNT_NOTE_CATEGORIES = [
  { id: "internal", label: "Internal notes" },
  { id: "strategy", label: "Strategy notes" },
  { id: "meeting", label: "Meeting summaries" },
  { id: "risk", label: "Risks" },
] as const;

export type AccountNoteCategoryId = (typeof ACCOUNT_NOTE_CATEGORIES)[number]["id"];

const PREFIX = /^<!-- account-note:([a-z]+) -->\n/;

export function encodeAccountNoteContent(
  category: AccountNoteCategoryId,
  body: string,
): string {
  return `<!-- account-note:${category} -->\n${body.trim()}`;
}

export function decodeAccountNoteContent(content: string): {
  category: AccountNoteCategoryId;
  body: string;
} {
  const m = content.match(PREFIX);
  if (!m) return { category: "internal", body: content };
  const cat = m[1] as AccountNoteCategoryId;
  const valid = ACCOUNT_NOTE_CATEGORIES.some((c) => c.id === cat);
  return {
    category: valid ? cat : "internal",
    body: content.slice(m[0].length),
  };
}

export function categoryLabel(id: AccountNoteCategoryId): string {
  return ACCOUNT_NOTE_CATEGORIES.find((c) => c.id === id)?.label ?? "Note";
}
