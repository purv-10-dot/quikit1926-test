export type DocumentCategory =
  | "OfferLetter" | "Policy" | "IdProof" | "Certificate" | "Contract"
  | "AppointmentLetter" | "ExperienceLetter" | "RelievingLetter" | "NDA" | "Other";

export type DocumentStatus = "Draft" | "Active" | "Archived" | "Expired";
export type DocumentAckStatus = "Pending" | "Acknowledged" | "Declined";
export type DocumentAccessLevel = "View" | "Download";

export interface DocumentData {
  id: string;
  orgId: string;
  employeeId: string | null;
  title: string;
  description: string | null;
  category: DocumentCategory;
  fileUrl: string;
  fileType: string;
  fileSize: number;
  version: number;
  isTemplate: boolean;
  status: DocumentStatus;
  expiryDate: string | null;
  uploadedBy: string;
  tags: string[] | null;
  metadata: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface DocumentAcknowledgmentData {
  id: string;
  documentId: string;
  employeeId: string;
  acknowledgedAt: string | null;
  status: DocumentAckStatus;
  signature: string | null;
}

export interface DocumentShareData {
  id: string;
  documentId: string;
  sharedWith: string;
  sharedBy: string;
  accessLevel: DocumentAccessLevel;
  expiresAt: string | null;
}
