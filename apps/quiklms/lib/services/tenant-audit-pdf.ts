/**
 * Tenant audit trail PDF — port of the pdfkit table in
 * `tenant-audit.controller.ts:86-184`.
 *
 * The route previously returned **501**: pdfkit was not a dependency and the
 * export was deferred, so a tenant admin clicking "Export PDF" got an error
 * (GAP_REPORT §3.2 audit).
 *
 * Rendered with **jsPDF** rather than pdfkit — jsPDF is already a dependency
 * (the certificate renderer uses it) and is buffer-based, which suits a Next
 * route handler returning a Response body; pdfkit is stream/pipe-oriented for an
 * Express `res`. Same A4-landscape geometry, same indigo header, same
 * alternating rows, same column widths, same pagination.
 */
import { jsPDF } from 'jspdf';

export interface AuditPdfLog {
  createdAt: Date | string;
  actionType: string;
  description: string | null;
  performedBy: { firstName?: string | null; lastName?: string | null; email?: string | null } | string | null;
}

export interface AuditPdfFilters {
  startDate?: Date;
  endDate?: Date;
  actionType?: string;
}

/** Legacy label: "First Last" → email → "System". */
function performedByLabel(performedBy: AuditPdfLog['performedBy']): string {
  if (performedBy && typeof performedBy === 'object') {
    if (performedBy.firstName && performedBy.lastName) return `${performedBy.firstName} ${performedBy.lastName}`;
    if (performedBy.email) return performedBy.email;
  }
  return 'System';
}

const LEFT = 50;
const COL_W = [110, 130, 310, 130]; // Time, Action, Description, Performed By
const GAP = 8;
const ROW_PAD = 6;
const PAGE_BOTTOM = 545; // safe bottom for landscape A4 (595 tall)

export function buildTenantAuditPdf(logs: AuditPdfLog[], filters: AuditPdfFilters = {}): Buffer {
  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
  const pageW = doc.internal.pageSize.getWidth();

  const colX: number[] = [LEFT];
  for (let i = 1; i < COL_W.length; i++) colX.push(colX[i - 1] + COL_W[i - 1] + GAP);
  const tableWidth = colX[colX.length - 1] + COL_W[COL_W.length - 1] - LEFT;

  // ── Title ──
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text('Tenant Audit Trail', pageW / 2, 60, { align: 'center' });

  // ── Subtitle: active filters ──
  let headerY = 80;
  const filterParts: string[] = [];
  if (filters.startDate) filterParts.push(`From: ${filters.startDate.toLocaleDateString()}`);
  if (filters.endDate) filterParts.push(`To: ${filters.endDate.toLocaleDateString()}`);
  if (filters.actionType) filterParts.push(`Action: ${filters.actionType}`);
  if (filterParts.length) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text(`Filters: ${filterParts.join(' | ')}`, pageW / 2, headerY, { align: 'center' });
    headerY += 14;
  }

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(
    `Generated: ${new Date().toLocaleString()}  •  Total records: ${logs.length}`,
    pageW / 2,
    headerY,
    { align: 'center' },
  );
  headerY += 24;

  const drawTableHeader = (y: number): number => {
    doc.setFillColor(79, 70, 229); // #4f46e5
    doc.rect(LEFT, y, tableWidth, 22, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text('DATE / TIME', colX[0] + 4, y + 14);
    doc.text('ACTION', colX[1] + 4, y + 14);
    doc.text('DESCRIPTION', colX[2] + 4, y + 14);
    doc.text('PERFORMED BY', colX[3] + 4, y + 14);
    doc.setTextColor(0, 0, 0);
    return y + 22;
  };

  let y = drawTableHeader(headerY);

  if (logs.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(107, 114, 128);
    doc.text('No audit logs found for the selected criteria.', LEFT + tableWidth / 2, y + 24, { align: 'center' });
    doc.setTextColor(0, 0, 0);
    return Buffer.from(doc.output('arraybuffer'));
  }

  logs.forEach((log, index) => {
    const dateStr = new Date(log.createdAt).toLocaleString();
    const descText = log.description || '';
    const performedBy = performedByLabel(log.performedBy);

    // Wrap the description and size the row to it, as pdfkit's heightOfString did.
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const descLines = doc.splitTextToSize(descText, COL_W[2] - 8) as string[];
    const descHeight = descLines.length * 10;
    const rowHeight = Math.max(28, descHeight + ROW_PAD * 2);

    if (y + rowHeight > PAGE_BOTTOM) {
      doc.addPage('a4', 'landscape');
      y = drawTableHeader(50);
    }

    // Alternating row background.
    if (index % 2 === 0) {
      doc.setFillColor(249, 250, 251); // #f9fafb
      doc.rect(LEFT, y, tableWidth, rowHeight, 'F');
    }

    // Row bottom border.
    doc.setDrawColor(229, 231, 235); // #e5e7eb
    doc.setLineWidth(0.5);
    doc.line(LEFT, y + rowHeight, LEFT + tableWidth, y + rowHeight);

    const textY = y + ROW_PAD + 8;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(17, 24, 39); // #111827
    doc.text(doc.splitTextToSize(dateStr, COL_W[0] - 8) as string[], colX[0] + 4, textY);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(67, 56, 202); // #4338ca
    doc.text(doc.splitTextToSize(log.actionType, COL_W[1] - 8) as string[], colX[1] + 4, textY);

    doc.setFont('helvetica', 'normal');
    doc.setTextColor(55, 65, 81); // #374151
    doc.text(descLines, colX[2] + 4, textY);

    doc.setTextColor(17, 24, 39);
    doc.text(doc.splitTextToSize(performedBy, COL_W[3] - 8) as string[], colX[3] + 4, textY);

    y += rowHeight;
  });

  return Buffer.from(doc.output('arraybuffer'));
}
