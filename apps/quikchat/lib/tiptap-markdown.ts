export interface TiptapNode {
  type?: string;
  text?: string;
  marks?: { type: string }[];
  content?: TiptapNode[];
}

const MARK = { bold: "**", italic: "*", strike: "~" } as const;

/** Wrap a text run with its marks. `code` is terminal (literal) — it ignores
 *  other marks, matching how RichText renders inline code. */
function applyMarks(text: string, marks: { type: string }[] = []): string {
  const has = (t: string) => marks.some((m) => m.type === t);
  if (has("code")) return "`" + text + "`";
  let out = text;
  if (has("italic")) out = `${MARK.italic}${out}${MARK.italic}`;
  if (has("bold")) out = `${MARK.bold}${out}${MARK.bold}`;
  if (has("strike")) out = `${MARK.strike}${out}${MARK.strike}`;
  return out;
}

function serializeInline(nodes: TiptapNode[] = []): string {
  return nodes
    .map((n) => {
      if (n.type === "hardBreak") return "\n";
      if (n.type === "text") return applyMarks(n.text ?? "", n.marks);
      return "";
    })
    .join("");
}

/** ProseMirror doc JSON → the narrow markdown RichText parses. Stage-1 scope:
 *  paragraphs of inline text with bold/italic/strike/code marks + hard breaks. */
export function serializeToMarkdown(doc: TiptapNode | null | undefined): string {
  if (!doc?.content) return "";
  return doc.content
    .map((block) => serializeInline(block.content))
    .join("\n")
    .trim();
}
