/**
 * Vendor (supplier) DTO for the Vendor Management feature.
 *
 * Mirrors the PLANNED `AstVendor` Prisma model (pending schema sign-off) — kept
 * deliberately minimal for this pass: no GST/PAN/bank/SLA/rating/purchase
 * history (those depend on Procurement, which doesn't exist yet). Reconcile with
 * the generated Prisma types once the model lands.
 */

export type VendorStatus = "Active" | "Inactive";

export type Vendor = {
  id: string;
  name: string;
  contactPerson?: string | null;
  phone?: string | null;
  email?: string | null;
  address?: string | null;
  status: VendorStatus;
  createdAt?: string;
  updatedAt?: string;
};
