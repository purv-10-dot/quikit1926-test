"use client";

import {
  getRequirementFields,
  parseRequirementTechnology,
  type RequirementDetails,
} from "@/lib/leads/lead-type-config";
import type { PhoneValue } from "@/components/leads/phone-field";

function ReviewBlock({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-crm-border bg-crm-panel/40 p-4">
      <h4 className="mb-3 text-sm font-semibold text-crm-text">{title}</h4>
      <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">{children}</dl>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="text-crm-muted">{label}</dt>
      <dd className="font-medium text-crm-text">{value || "—"}</dd>
    </>
  );
}

export function LeadFormReview({
  name,
  ownerLabel,
  status,
  source,
  stage,
  score,
  leadType,
  company,
  industry,
  annualRevenueDisplay,
  website,
  linkedinUrl,
  budgetLabel,
  accountLabel,
  addressSummary,
  firstName,
  lastName,
  jobTitle,
  email,
  secondaryEmail,
  phoneLabel,
  mobileLabel,
  contactLinkedinUrl,
  requirementDetails,
}: {
  name: string;
  ownerLabel: string;
  status: string;
  source: string;
  stage: string;
  score: number;
  leadType: string;
  company: string;
  industry: string;
  annualRevenueDisplay: string;
  website: string;
  linkedinUrl: string;
  budgetLabel: string;
  accountLabel: string;
  addressSummary: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  email: string;
  secondaryEmail: string;
  phoneLabel: string;
  mobileLabel: string;
  contactLinkedinUrl: string;
  requirementDetails: RequirementDetails;
}) {
  const reqFields = leadType ? getRequirementFields(leadType) : [];
  const tech = parseRequirementTechnology(requirementDetails.technology);

  return (
    <div className="space-y-4">
      <p className="text-sm text-crm-muted">
        Review all details before saving. Use Previous to edit any section.
      </p>

      <ReviewBlock title="Lead Information">
        <ReviewRow label="Lead Name" value={name} />
        <ReviewRow label="Lead Owner" value={ownerLabel} />
        <ReviewRow label="Lead Status" value={status} />
        <ReviewRow label="Lead Source" value={source} />
        <ReviewRow label="Lead Stage" value={stage} />
        <ReviewRow label="Lead Score" value={String(score)} />
      </ReviewBlock>

      <ReviewBlock title="Company Information">
        <ReviewRow label="Company Name" value={company} />
        <ReviewRow label="Industry" value={industry} />
        <ReviewRow label="Annual Revenue" value={annualRevenueDisplay} />
        <ReviewRow label="Website" value={website} />
        <ReviewRow label="LinkedIn URL" value={linkedinUrl} />
        <ReviewRow label="Budget" value={budgetLabel} />
        <ReviewRow label="Linked Account" value={accountLabel} />
        <ReviewRow label="Address" value={addressSummary} />
      </ReviewBlock>

      <ReviewBlock title="Contact Information">
        <ReviewRow label="First Name" value={firstName} />
        <ReviewRow label="Last Name" value={lastName} />
        <ReviewRow label="Job Title" value={jobTitle} />
        <ReviewRow label="Email" value={email} />
        <ReviewRow label="Secondary Email" value={secondaryEmail} />
        <ReviewRow label="Phone" value={phoneLabel} />
        <ReviewRow label="Mobile" value={mobileLabel} />
        <ReviewRow label="LinkedIn Account" value={contactLinkedinUrl} />
      </ReviewBlock>

    </div>
  );
}

export function formatPhoneSummary(phone: PhoneValue): string {
  if (!phone.number) return "";
  return `${phone.dialCode} ${phone.number}`;
}
