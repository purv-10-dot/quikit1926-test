type ExtractedFields = {
  vendor_name: string | null;
  invoice_number: string | null;
  issue_date: string | null;
  due_date: string | null;
  subtotal: number | null;
  tax_total: number | null;
  total: number | null;
  gstin: string | null;
};

function parseMoney(line: string) {
  const match = line.replace(/[, ]/g, "").match(/-?\d+(?:\.\d{1,2})?/g);
  if (!match || match.length === 0) {
    return null;
  }
  const value = Number(match[match.length - 1]);
  return Number.isFinite(value) ? value : null;
}

function parseDate(line: string) {
  const match = line.match(/(\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})/);
  if (!match) {
    return null;
  }
  const parsed = new Date(match[1]);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
}

function textAfterColon(line: string) {
  const [, value] = line.split(/:\s*/, 2);
  return value?.trim() ?? null;
}

export function extractDocumentFields(sourceText: string): ExtractedFields {
  const lines = sourceText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  let vendorName: string | null = lines[0] ?? null;
  let invoiceNumber: string | null = null;
  let issueDate: string | null = null;
  let dueDate: string | null = null;
  let subtotal: number | null = null;
  let taxTotal: number | null = null;
  let total: number | null = null;
  let gstin: string | null = null;

  for (const line of lines) {
    const lower = line.toLowerCase();

    if (!invoiceNumber && /(invoice|bill)\s*(no|number|#|id)/.test(lower)) {
      invoiceNumber = textAfterColon(line) ?? line.split(/\s+/).slice(-1)[0] ?? null;
      continue;
    }

    if (!issueDate && /(invoice date|bill date|issue date|date)/.test(lower)) {
      issueDate = parseDate(line);
      continue;
    }

    if (!dueDate && /due date/.test(lower)) {
      dueDate = parseDate(line);
      continue;
    }

    if (!subtotal && /(subtotal|taxable amount|net amount)/.test(lower)) {
      subtotal = parseMoney(line);
      continue;
    }

    if (!taxTotal && /(gst|tax total|tax amount|cgst|sgst|igst)/.test(lower)) {
      taxTotal = parseMoney(line);
      continue;
    }

    if (!total && /(grand total|invoice total|bill total|amount due|total payable|total)/.test(lower)) {
      total = parseMoney(line);
      continue;
    }

    if (!gstin && /gstin|gst no|gst number/.test(lower)) {
      gstin = textAfterColon(line) ?? line.split(/\s+/).slice(-1)[0] ?? null;
      continue;
    }

    if (!vendorName && line.length > 3) {
      vendorName = line;
    }
  }

  if (!subtotal && total != null && taxTotal != null) {
    subtotal = Math.max(0, total - taxTotal);
  }

  return {
    vendor_name: vendorName,
    invoice_number: invoiceNumber,
    issue_date: issueDate,
    due_date: dueDate ?? issueDate,
    subtotal,
    tax_total: taxTotal ?? 0,
    total: total ?? subtotal ?? 0,
    gstin
  };
}
