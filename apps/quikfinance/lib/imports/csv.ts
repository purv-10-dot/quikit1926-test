type ParsedRow = Record<string, string>;

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    const next = line[index + 1];

    if (char === "\"") {
      if (inQuotes && next === "\"") {
        current += "\"";
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current.trim());
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells;
}

function normalizeHeader(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function rowsFromJson(value: unknown): ParsedRow[] {
  if (Array.isArray(value)) {
    return value
      .filter((entry): entry is Record<string, unknown> => typeof entry === "object" && entry !== null && !Array.isArray(entry))
      .map((entry) =>
        Object.fromEntries(
          Object.entries(entry).map(([key, cell]) => [normalizeHeader(key), cell == null ? "" : String(cell)])
        )
      );
  }

  if (typeof value === "object" && value !== null && "rows" in value) {
    return rowsFromJson((value as { rows?: unknown }).rows);
  }

  return [];
}

export function parseStructuredText(input: string): ParsedRow[] {
  const text = input.trim();
  if (!text) {
    return [];
  }

  if (text.startsWith("[") || text.startsWith("{")) {
    try {
      return rowsFromJson(JSON.parse(text));
    } catch {
      return [];
    }
  }

  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  if (lines.length < 2) {
    return [];
  }

  const headers = splitCsvLine(lines[0]).map(normalizeHeader);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return headers.reduce<ParsedRow>((row, header, index) => {
      row[header] = cells[index] ?? "";
      return row;
    }, {});
  });
}

export function pickField(row: ParsedRow, aliases: string[]) {
  const lookup = aliases.map(normalizeHeader);
  for (const alias of lookup) {
    const value = row[alias];
    if (value && value.length > 0) {
      return value;
    }
  }
  return "";
}

export function parseMoneyValue(value: string) {
  const normalized = value
    .replace(/[, ]/g, "")
    .replace(/[A-Za-z$Rs₹]/g, "")
    .replace(/^\((.*)\)$/, "-$1");
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function parseDateValue(value: string, fallback: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return fallback;
  }

  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) {
    return fallback;
  }

  return parsed.toISOString().slice(0, 10);
}
