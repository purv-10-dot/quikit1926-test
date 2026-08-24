import { sanitizeRichText } from "@/lib/sanitize";

export type NotesIssueType = "TASK" | "BUG" | "STORY" | "EPIC" | "SUBTASK";

export interface NotesSourceItem {
  id: string;
  key: string;
  title: string;
  type: NotesIssueType;
  description: string | null;
}

/** Display-order + plural heading for each work type, matching Jira's
 * grouped "Story" / "Bug" / "Task" section headings in release notes. */
export const NOTES_TYPE_META: Record<NotesIssueType, { label: string; order: number }> = {
  STORY: { label: "Story", order: 0 },
  TASK: { label: "Task", order: 1 },
  BUG: { label: "Bug", order: 2 },
  EPIC: { label: "Epic", order: 3 },
  SUBTASK: { label: "Sub-task", order: 4 },
};

export const NOTES_TYPE_OPTIONS: { value: NotesIssueType; label: string }[] = (
  Object.keys(NOTES_TYPE_META) as NotesIssueType[]
)
  .sort((a, b) => NOTES_TYPE_META[a].order - NOTES_TYPE_META[b].order)
  .map((value) => ({ value, label: NOTES_TYPE_META[value].label }));

export interface NotesFieldOptions {
  showKeys: boolean;
  showDescription: boolean;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** Collapse rich-text HTML to a single line of plain text — for the Markdown
 * export and any place that must not carry tags. Unescapes the common numeric/
 * named entities so "&amp;" reads as "&", not literally. */
function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<\/(p|div|li|h[1-6])>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function groupByType(items: NotesSourceItem[]): [NotesIssueType, NotesSourceItem[]][] {
  const groups = new Map<NotesIssueType, NotesSourceItem[]>();
  for (const item of items) {
    const list = groups.get(item.type) ?? [];
    list.push(item);
    groups.set(item.type, list);
  }
  return Array.from(groups.entries()).sort(
    ([a], [b]) => NOTES_TYPE_META[a].order - NOTES_TYPE_META[b].order,
  );
}

export function buildReleaseNotesHtml(
  releaseName: string,
  projectName: string,
  items: NotesSourceItem[],
  fields: NotesFieldOptions,
): string {
  const groups = groupByType(items);
  const body = groups
    .map(([type, groupItems]) => {
      const rows = groupItems
        .map((item) => {
          const keyPart = fields.showKeys
            ? `<a href="#" style="text-decoration:underline">${escapeHtml(item.key)}</a> `
            : "";
          // The description is stored as rich-text HTML. Escaping it (as the
          // title, a plain string, is) would print the raw <p>/<a> tags to the
          // user. Sanitize it instead so it renders as formatted text with only
          // safe tags kept.
          const descPart =
            fields.showDescription && item.description
              ? `<div style="color:#5e6c84;font-size:13px;margin-top:2px;">${sanitizeRichText(item.description)}</div>`
              : "";
          return `<div style="margin:4px 0;">${keyPart}${escapeHtml(item.title)}${descPart}</div>`;
        })
        .join("");
      return `<h3 style="margin:16px 0 4px;">${NOTES_TYPE_META[type].label}</h3>${rows}`;
    })
    .join("");
  return `<h2 style="margin:0 0 12px;">Release notes - ${escapeHtml(projectName)} - ${escapeHtml(releaseName)}</h2>${body}`;
}

export function buildReleaseNotesMarkdown(
  releaseName: string,
  projectName: string,
  items: NotesSourceItem[],
  fields: NotesFieldOptions,
): string {
  const groups = groupByType(items);
  const lines = [`# Release notes - ${projectName} - ${releaseName}`, ""];
  for (const [type, groupItems] of groups) {
    lines.push(`## ${NOTES_TYPE_META[type].label}`, "");
    for (const item of groupItems) {
      const keyPart = fields.showKeys ? `[${item.key}] ` : "";
      lines.push(`- ${keyPart}${item.title}`);
      if (fields.showDescription && item.description) {
        // Description is rich-text HTML — flatten to plain text so the Markdown
        // export doesn't carry raw <p>/<a> tags.
        const desc = htmlToPlainText(item.description);
        if (desc) lines.push(`  ${desc}`);
      }
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}
