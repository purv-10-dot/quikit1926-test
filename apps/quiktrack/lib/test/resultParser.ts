/**
 * QuikTest — pluggable automation result parsers.
 *
 * The automation write path accepts framework output and normalises it into
 * `ParsedResult[]`, which the ingester then maps to cases by `automationId` and
 * INSERTs into the append-only result store. Keeping the parse step behind the
 * `ResultParser` interface is what lets TAP / NUnit / Allure be added later as
 * new parsers WITHOUT touching the store (an explicit requirement of TM-6).
 *
 * Deliberately dependency-free: `apps/quiktrack/CLAUDE.md` rule 3 requires PR
 * justification for new top-level deps, and a hand-rolled scanner also gives us
 * the line/column detail that `Malformed XML -> 400 with line info` needs —
 * most lightweight XML libraries throw without a position.
 */

/** Canonical statuses a parser may emit. Mapped to QtTestStatus rows by name. */
export type ParsedStatus = "Passed" | "Failed" | "Blocked" | "Skipped";

/** One normalised execution outcome, before it is mapped to a case. */
export interface ParsedResult {
  /** Stable external id, e.g. `checkout.spec.ts::guest_can_pay`. */
  automationId: string;
  status: ParsedStatus;
  /** Wall-clock duration in ms. null when the framework omitted `time`. */
  elapsedMs: number | null;
  failureMessage: string | null;
  stackTrace: string | null;
  /** Suite path the case came from — kept for unmatched-id diagnostics. */
  suite: string | null;
}

export interface ParseOptions {
  /**
   * How `classname` + `name` combine into an `automationId`. Configurable
   * because teams' automation_id schemes differ (TM-6.1 edge case).
   *   "classname::name" (default) — `LoginTest::valid_creds`
   *   "classname.name"            — `LoginTest.valid_creds`
   *   "name"                      — bare test name
   */
  automationIdFormat?: "classname::name" | "classname.name" | "name";
  /**
   * Status for `<skipped>`. TestRail-style installs differ on whether a skipped
   * test is "Blocked" or its own "Skipped" status; QuikTest seeds both.
   */
  skippedStatus?: Extract<ParsedStatus, "Blocked" | "Skipped">;
}

/** Thrown on unparseable input. Carries position so the route can 400 with it. */
export class ResultParseError extends Error {
  readonly line: number;
  readonly column: number;

  constructor(message: string, line: number, column: number) {
    super(`${message} (line ${line}, column ${column})`);
    this.name = "ResultParseError";
    this.line = line;
    this.column = column;
  }
}

/** The seam that keeps the store format-agnostic. */
export interface ResultParser {
  /** Short id, e.g. "junit". Surfaced in the ingest summary. */
  readonly format: string;
  /** True when this parser recognises the payload. Enables auto-detection. */
  canParse(text: string): boolean;
  parse(text: string, opts?: ParseOptions): ParsedResult[];
}

/* ─────────────────────────── minimal XML scanner ─────────────────────────── */

interface XmlNode {
  name: string;
  attrs: Record<string, string>;
  children: XmlNode[];
  text: string;
}

const NAME_START = /[A-Za-z_:]/;

/**
 * Parses the XML subset JUnit reports actually use: elements, attributes,
 * text, CDATA, comments, the prolog and self-closing tags. Not a general XML
 * processor — no DTDs, no namespace resolution, no entity declarations.
 * Raises `ResultParseError` with a position on anything malformed.
 */
function parseXml(text: string): XmlNode {
  let i = 0;

  // Position is computed only when an error is raised, so the happy path
  // doesn't pay for line tracking on every character.
  const posAt = (idx: number): { line: number; column: number } => {
    let line = 1;
    let lastNewline = -1;
    for (let k = 0; k < idx && k < text.length; k++) {
      if (text[k] === "\n") {
        line++;
        lastNewline = k;
      }
    }
    return { line, column: idx - lastNewline };
  };

  const fail = (message: string, idx: number = i): never => {
    const { line, column } = posAt(idx);
    throw new ResultParseError(message, line, column);
  };

  const decodeEntities = (raw: string): string =>
    raw.replace(/&(#x?[0-9A-Fa-f]+|[a-zA-Z]+);/g, (match, entity: string) => {
      switch (entity) {
        case "amp":
          return "&";
        case "lt":
          return "<";
        case "gt":
          return ">";
        case "quot":
          return '"';
        case "apos":
          return "'";
        default:
          break;
      }
      if (entity.startsWith("#x") || entity.startsWith("#X")) {
        const code = Number.parseInt(entity.slice(2), 16);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      if (entity.startsWith("#")) {
        const code = Number.parseInt(entity.slice(1), 10);
        return Number.isNaN(code) ? match : String.fromCodePoint(code);
      }
      // Unknown named entity — leave it verbatim rather than guessing.
      return match;
    });

  const skipWhitespace = () => {
    while (i < text.length && /\s/.test(text[i])) i++;
  };

  /** Consumes prolog/comments/doctype that may appear before or between nodes. */
  const skipMisc = (): void => {
    for (;;) {
      skipWhitespace();
      if (text.startsWith("<?", i)) {
        const end = text.indexOf("?>", i + 2);
        if (end === -1) fail("Unterminated XML declaration");
        i = end + 2;
        continue;
      }
      if (text.startsWith("<!--", i)) {
        const end = text.indexOf("-->", i + 4);
        if (end === -1) fail("Unterminated comment");
        i = end + 3;
        continue;
      }
      if (text.startsWith("<!DOCTYPE", i)) {
        const end = text.indexOf(">", i);
        if (end === -1) fail("Unterminated DOCTYPE");
        i = end + 1;
        continue;
      }
      return;
    }
  };

  const readName = (): string => {
    const start = i;
    if (i >= text.length || !NAME_START.test(text[i])) fail("Expected element name");
    while (i < text.length && /[A-Za-z0-9_.:-]/.test(text[i])) i++;
    return text.slice(start, i);
  };

  const readAttrs = (): Record<string, string> => {
    const attrs: Record<string, string> = {};
    for (;;) {
      skipWhitespace();
      if (i >= text.length) fail("Unexpected end of input in attribute list");
      if (text[i] === ">" || text.startsWith("/>", i)) return attrs;

      const name = readName();
      skipWhitespace();
      if (text[i] !== "=") fail(`Expected '=' after attribute '${name}'`);
      i++;
      skipWhitespace();

      const quote = text[i];
      if (quote !== '"' && quote !== "'") {
        fail(`Attribute '${name}' value must be quoted`);
      }
      i++;
      const start = i;
      while (i < text.length && text[i] !== quote) i++;
      if (i >= text.length) fail(`Unterminated value for attribute '${name}'`);
      attrs[name] = decodeEntities(text.slice(start, i));
      i++;
    }
  };

  const parseElement = (): XmlNode => {
    const openedAt = i;
    if (text[i] !== "<") fail("Expected '<'");
    i++;
    const name = readName();
    const attrs = readAttrs();

    const node: XmlNode = { name, attrs, children: [], text: "" };

    if (text.startsWith("/>", i)) {
      i += 2;
      return node;
    }
    if (text[i] !== ">") fail(`Malformed start tag '<${name}>'`);
    i++;

    const textParts: string[] = [];

    for (;;) {
      if (i >= text.length) {
        fail(`Unclosed element '<${name}>'`, openedAt);
      }

      if (text.startsWith("</", i)) {
        i += 2;
        const closing = readName();
        skipWhitespace();
        if (text[i] !== ">") fail(`Malformed end tag '</${closing}>'`);
        i++;
        if (closing !== name) {
          fail(`Mismatched tag: '<${name}>' closed by '</${closing}>'`, openedAt);
        }
        node.text = decodeEntities(textParts.join("")).trim();
        return node;
      }

      if (text.startsWith("<![CDATA[", i)) {
        const end = text.indexOf("]]>", i + 9);
        if (end === -1) fail("Unterminated CDATA section");
        // CDATA is literal — must not be entity-decoded, so it is pushed
        // pre-decoded via a marker-free direct append after the join. Simplest
        // correct approach: decode only non-CDATA parts, so stash it decoded.
        textParts.push(encodeForVerbatim(text.slice(i + 9, end)));
        i = end + 3;
        continue;
      }

      if (text.startsWith("<!--", i)) {
        const end = text.indexOf("-->", i + 4);
        if (end === -1) fail("Unterminated comment");
        i = end + 3;
        continue;
      }

      if (text[i] === "<") {
        node.children.push(parseElement());
        continue;
      }

      const nextTag = text.indexOf("<", i);
      const stop = nextTag === -1 ? text.length : nextTag;
      textParts.push(text.slice(i, stop));
      i = stop;
    }
  };

  skipMisc();
  if (i >= text.length) fail("Empty document");
  const root = parseElement();
  skipMisc();
  return root;
}

/**
 * CDATA content must survive entity decoding unchanged (a literal `&amp;`
 * inside CDATA stays `&amp;`). Escaping the ampersands means the single
 * decode pass over the joined text leaves it verbatim.
 */
function encodeForVerbatim(raw: string): string {
  return raw.replace(/&/g, "&amp;");
}

/* ───────────────────────────── JUnit / xUnit ───────────────────────────── */

function collect(node: XmlNode, name: string, out: XmlNode[] = []): XmlNode[] {
  if (node.name === name) out.push(node);
  for (const child of node.children) collect(child, name, out);
  return out;
}

function firstChild(node: XmlNode, name: string): XmlNode | null {
  return node.children.find((c) => c.name === name) ?? null;
}

/** Nearest enclosing `<testsuite name>` for a `<testcase>`, for diagnostics. */
function suiteNameFor(root: XmlNode, target: XmlNode): string | null {
  let found: string | null = null;
  const walk = (node: XmlNode, inherited: string | null): void => {
    const current =
      node.name === "testsuite" && node.attrs.name ? node.attrs.name : inherited;
    if (node === target) {
      found = current;
      return;
    }
    for (const child of node.children) walk(child, current);
  };
  walk(root, null);
  return found;
}

function toElapsedMs(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === "") return null;
  const seconds = Number.parseFloat(raw);
  if (!Number.isFinite(seconds) || seconds < 0) return null;
  return Math.round(seconds * 1000);
}

function buildAutomationId(
  classname: string | undefined,
  name: string,
  format: NonNullable<ParseOptions["automationIdFormat"]>,
): string {
  if (format === "name" || !classname) return name;
  return format === "classname.name" ? `${classname}.${name}` : `${classname}::${name}`;
}

/**
 * Reads the failure detail. JUnit writers are inconsistent: some put the
 * summary in `message` and the trace in the element body, others emit only a
 * body. Treat `message` as the summary and the body as the trace, falling back
 * to the body for the summary when no attribute exists.
 */
function failureDetail(el: XmlNode): { message: string | null; stack: string | null } {
  const attr = el.attrs.message?.trim();
  const body = el.text.trim();
  if (attr && body) return { message: attr, stack: body };
  if (attr) return { message: attr, stack: null };
  if (body) {
    const firstLine = body.split("\n", 1)[0].trim();
    return { message: firstLine, stack: body };
  }
  return { message: el.attrs.type?.trim() || null, stack: null };
}

export const junitParser: ResultParser = {
  format: "junit",

  canParse(text: string): boolean {
    return /<\s*(testsuites|testsuite)\b/.test(text);
  },

  parse(text: string, opts: ParseOptions = {}): ParsedResult[] {
    const format = opts.automationIdFormat ?? "classname::name";
    const skippedStatus = opts.skippedStatus ?? "Blocked";

    if (text.trim() === "") {
      throw new ResultParseError("Empty document", 1, 1);
    }

    const root = parseXml(text);

    if (root.name !== "testsuites" && root.name !== "testsuite") {
      throw new ResultParseError(
        `Expected root <testsuites> or <testsuite>, got <${root.name}>`,
        1,
        1,
      );
    }

    // `collect` walks the whole tree, so arbitrarily nested <testsuite>
    // elements are handled without special-casing depth.
    return collect(root, "testcase").map((tc) => {
      const name = tc.attrs.name ?? "";
      const automationId = buildAutomationId(tc.attrs.classname, name, format);

      const failure = firstChild(tc, "failure") ?? firstChild(tc, "error");
      const skipped = firstChild(tc, "skipped");

      let status: ParsedStatus = "Passed";
      let message: string | null = null;
      let stack: string | null = null;

      if (failure) {
        status = "Failed";
        const detail = failureDetail(failure);
        message = detail.message;
        stack = detail.stack;
      } else if (skipped) {
        status = skippedStatus;
        message = skipped.attrs.message?.trim() || skipped.text.trim() || null;
      }

      return {
        automationId,
        status,
        elapsedMs: toElapsedMs(tc.attrs.time),
        failureMessage: message,
        stackTrace: stack,
        suite: suiteNameFor(root, tc),
      };
    });
  },
};

/** Registry of available parsers. TAP/NUnit/Allure append here. */
export const RESULT_PARSERS: readonly ResultParser[] = [junitParser];

/** Picks a parser by format id, or auto-detects when `format` is omitted. */
export function selectParser(text: string, format?: string): ResultParser {
  if (format) {
    const named = RESULT_PARSERS.find((p) => p.format === format);
    if (!named) throw new ResultParseError(`Unknown report format '${format}'`, 1, 1);
    return named;
  }
  const detected = RESULT_PARSERS.find((p) => p.canParse(text));
  if (!detected) {
    throw new ResultParseError("Unrecognised report format", 1, 1);
  }
  return detected;
}
