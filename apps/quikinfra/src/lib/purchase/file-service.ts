/**
 * FileAttachmentService — Reusable file metadata model + storage abstraction
 *
 * Supports: quotation, challan, invoice, MRN PDF, gate pass PDF, amendment PDF
 */

export interface FileMetadata {
  id: string;
  entityType: "mr" | "indent" | "po" | "grn" | "amendment" | "enquiry" | "quotation";
  entityId: string;
  fileRole: "quotation" | "challan" | "invoice" | "mrn_pdf" | "gate_pass_pdf" | "amendment_pdf" | "supporting";
  originalName: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  uploadedBy: string;
  createdAt: string;
}

// In-memory store for demo mode
const g = globalThis as any;
if (!g.__qcFileAttachments) g.__qcFileAttachments = [] as FileMetadata[];

export class FileAttachmentService {
  /** Attach a file metadata record to an entity */
  attach(meta: Omit<FileMetadata, "id" | "createdAt">): FileMetadata {
    const record: FileMetadata = {
      ...meta,
      id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
    };
    g.__qcFileAttachments.push(record);
    return record;
  }

  /** Get all attachments for an entity */
  getForEntity(entityType: string, entityId: string): FileMetadata[] {
    return g.__qcFileAttachments.filter(
      (f: FileMetadata) => f.entityType === entityType && f.entityId === entityId
    );
  }

  /** Check if a required attachment role exists for an entity */
  hasRequiredAttachment(entityType: string, entityId: string, fileRole: string): boolean {
    return g.__qcFileAttachments.some(
      (f: FileMetadata) => f.entityType === entityType && f.entityId === entityId && f.fileRole === fileRole
    );
  }

  /** Validate required attachments for a workflow state transition */
  validateAttachments(entityType: string, entityId: string, requiredRoles: string[]): string[] {
    const missing: string[] = [];
    for (const role of requiredRoles) {
      if (!this.hasRequiredAttachment(entityType, entityId, role)) {
        missing.push(role);
      }
    }
    return missing;
  }
}

export const fileService = new FileAttachmentService();
