import type { PhoneValue } from "@/components/leads/phone-field";
import type { LeadFieldDefinition } from "@/types/field-definition";

export interface LeadFormStepValidationInput {
  name: string;
  company: string;
  firstName: string;
  lastName: string;
  email: string;
  secondaryEmail: string;
  phone: PhoneValue;
  mobile: PhoneValue;
  source: string;
  stage: string;
  status: string;
  leadType: string;
  ownerId: string;
  ownerNameRaw: string;
  ownersCount: number;
  lat: string;
  long: string;
  pipelineReady: boolean;
  pipelineStages: string[];
  pipelineStatuses: string[];
  defs: LeadFieldDefinition[];
  dynValues: Record<string, unknown>;
}

/** Validate fields for a single wizard step (create flow). */
export function validateLeadFormStep(
  step: number,
  input: LeadFormStepValidationInput,
): Record<string, string> {
  const errs: Record<string, string> = {};

  switch (step) {
    case 0: {
      if (!input.name.trim()) errs.name = "Lead name is required";
      const hasOwner = input.ownersCount > 0 ? !!input.ownerId : !!input.ownerNameRaw.trim();
      if (!hasOwner) errs.ownerId = "Owner is required";
      if (!input.source.trim()) errs.source = "Source is required";
      if (!input.stage) errs.stage = "Stage is required";
      if (input.pipelineReady && input.stage && !input.pipelineStages.includes(input.stage)) {
        errs.stage = `Choose a valid stage (${input.pipelineStages.join(", ")})`;
      }
      if (input.pipelineReady && input.status && !input.pipelineStatuses.includes(input.status)) {
        errs.status = `Choose a valid lead status (${input.pipelineStatuses.join(", ")})`;
      }
      break;
    }
    case 1: {
      if (!input.company.trim()) errs.company = "Company name is required";
      if (input.lat.trim()) {
        const n = Number(input.lat);
        if (Number.isNaN(n) || n < -90 || n > 90) errs.lat = "Latitude must be between -90 and 90";
      }
      if (input.long.trim()) {
        const n = Number(input.long);
        if (Number.isNaN(n) || n < -180 || n > 180) errs.long = "Longitude must be between -180 and 180";
      }
      break;
    }
    // Step 3 is the dynamic "Other Information" step — only active when custom
    // fields exist. Validates required custom fields at the per-step level.
    case 3: {
      for (const def of input.defs) {
        if (def.requirement !== "Required") continue;
        const v = input.dynValues[def.key];
        const empty =
          v == null ||
          v === "" ||
          (Array.isArray(v) && v.length === 0) ||
          (def.fieldType === "Phone" && (v as PhoneValue | undefined)?.number?.length !== 10);
        if (empty) errs[def.key] = `${def.label} is required`;
      }
      break;
    }
    case 2: {
      if (!input.firstName.trim()) errs.firstName = "First name is required";
      if (!input.lastName.trim()) errs.lastName = "Last name is required";
      if (!input.email.trim()) errs.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim())) {
        errs.email = "Invalid email format";
      }
      if (input.secondaryEmail.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.secondaryEmail.trim())) {
        errs.secondaryEmail = "Invalid email format";
      }
      if (input.mobile.number.length !== 10) errs.mobile = "Mobile must be exactly 10 digits";
      if (input.phone.number && input.phone.number.length !== 10) {
        errs.phone = "Phone must be exactly 10 digits";
      }
      break;
    }
    default:
      break;
  }

  return errs;
}
