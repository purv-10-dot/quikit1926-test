"use client";

import { LeadForm } from "@/components/leads/lead-form";

export function LeadDetailsForm({
  lead,
}: {
  lead: {
    id: string;
    name: string;
    email: string | null;
    phone: string | null;
    mobile?: string | null;
    company: string | null;
    jobTitle: string | null;
    source: string | null;
    stage: string;
    status: string;
    score: number;
    country?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    cityName?: string | null;
    stateName?: string | null;
    postalCode?: string | null;
    lat?: number | null;
    long?: number | null;
    industry?: string | null;
    secondaryEmail?: string | null;
    website?: string | null;
    linkedinUrl?: string | null;
    annualRevenueDisplay?: string | null;
    leadType?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    contactLinkedinUrl?: string | null;
    requirementDetails?: unknown;
    technology?: unknown;
    ownerId?: string | null;
    ownerName?: string | null;
    accountId?: string | null;
    account?: { id: string; name: string } | null;
    /** ICP reference + joined name. Read-only in the form (no control). */
    icpId?: string | null;
    icp?: { id: string; name: string } | null;
    dynamicFields?: Record<string, unknown> | null;
  };
}) {
  return (
    <LeadForm
      key={`${lead.id}:${lead.status}:${lead.stage}`}
      initial={{
        id: lead.id,
        name: lead.name,
        email: lead.email ?? "",
        phone: lead.phone ?? "",
        mobile: lead.mobile ?? "",
        company: lead.company ?? "",
        jobTitle: lead.jobTitle ?? "",
        source: lead.source ?? "",
        stage: lead.stage,
        status: lead.status,
        score: lead.score,
        country: lead.country ?? "",
        addressLine1: lead.addressLine1 ?? "",
        addressLine2: lead.addressLine2 ?? "",
        cityName: lead.cityName ?? "",
        stateName: lead.stateName ?? "",
        postalCode: lead.postalCode ?? "",
        lat: lead.lat != null ? String(lead.lat) : "",
        long: lead.long != null ? String(lead.long) : "",
        industry: lead.industry ?? "",
        secondaryEmail: lead.secondaryEmail ?? "",
        website: lead.website ?? "",
        linkedinUrl: lead.linkedinUrl ?? "",
        annualRevenueDisplay: lead.annualRevenueDisplay ?? "",
        leadType: lead.leadType ?? "",
        firstName: lead.firstName ?? "",
        lastName: lead.lastName ?? "",
        contactLinkedinUrl: lead.contactLinkedinUrl ?? "",
        requirementDetails: lead.requirementDetails,
        technology: lead.technology,
        ownerId: lead.ownerId ?? "",
        ownerName: lead.ownerName ?? "",
        accountId: lead.accountId ?? "",
        accountName: lead.account?.name ?? "",
        // Reference is forwarded so a save round-trips it unchanged; the name is
        // display-only for the read-only Lead Information field.
        icpId: lead.icpId ?? null,
        icpName: lead.icp?.name ?? null,
        dynamicFields: lead.dynamicFields ?? null,
      }}
    />
  );
}
