/**
 * Purchase Module — Barrel Export
 *
 * Single import point for all purchase services, enums, and types.
 * Usage: import { MRStatus, stockService, Errors } from "@/lib/purchase";
 */

export * from "./enums";
export * from "./errors";
export { stockService, StockAvailabilityService } from "./stock-service";
export type { StockCheckResult } from "./stock-service";
export { dashboardService, PurchaseDashboardService } from "./dashboard-service";
export { fileService, FileAttachmentService } from "./file-service";
export type { FileMetadata } from "./file-service";
export { enquiryService, EnquiryService } from "./enquiry-service";
export type { VendorEnquiry, VendorQuotation, QuotationComparison } from "./enquiry-service";
