/**
 * Remove `//` line comments and block comments from TS/JS source, leaving
 * everything else — including newlines — in place so line structure survives.
 *
 * String and template literals are tracked so a `//` inside a URL string does
 * not swallow the rest of the line. That direction matters for both callers:
 * over-stripping would drop a real match and silently exclude a file from a
 * guard scan, which is the failure those guards exist to prevent.
 *
 * Shared by the two static guard tests:
 *   • unit/agent-jwt-session-guard.test.ts     — selector pass
 *   • unit/issue-id-resolution-guard.test.ts   — selector AND assertion pass
 *
 * ⚠️ Hand-rolled scanner, not a parser. It does not understand regex literals,
 * so `/\/\//` and friends would confuse it. Neither guard's scan targets use
 * one on a significant line; a false negative there would need a regex literal
 * on the same line as the pattern being matched.
 */
export function stripComments(src: string): string {
  type State = "code" | "line" | "block" | "single" | "double" | "template";
  let state: State = "code";
  let out = "";
  let i = 0;

  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];

    if (state === "code") {
      if (c === "/" && next === "/") {
        state = "line";
        i += 2;
        continue;
      }
      if (c === "/" && next === "*") {
        state = "block";
        i += 2;
        continue;
      }
      if (c === "'") state = "single";
      else if (c === '"') state = "double";
      else if (c === "`") state = "template";
      out += c;
      i++;
      continue;
    }

    if (state === "line") {
      if (c === "\n") {
        state = "code";
        out += c;
      }
      i++;
      continue;
    }

    if (state === "block") {
      if (c === "*" && next === "/") {
        state = "code";
        i += 2;
        continue;
      }
      if (c === "\n") out += c; // keep line numbers honest
      i++;
      continue;
    }

    // Inside a string or template literal — copy verbatim, honour escapes.
    if (c === "\\") {
      out += c + (next ?? "");
      i += 2;
      continue;
    }
    if (
      (state === "single" && c === "'") ||
      (state === "double" && c === '"') ||
      (state === "template" && c === "`")
    ) {
      state = "code";
    }
    out += c;
    i++;
  }

  return out;
}
