export function pdfFileName(prefix: string, documentNumber: string) {
  const safeNumber = documentNumber.replace(/[^a-z0-9-]/gi, "-").toLowerCase();
  return `${prefix}-${safeNumber}.pdf`;
}
