/** Discriminators for unified Machinery & Equipment tables. */

export const DEPLOY_TRANSFER = "transfer";
export const DEPLOY_DOCUMENT = "document";

export const HIRE_RATE = "rate";
export const HIRE_IN = "hire_in";
export const RENT_OUT = "rent_out";

export const FA_ISSUANCE = "issuance";
export const FA_TRANSFER = "transfer";
export const FA_REPAIR = "repair";
export const FA_AUDIT = "audit";

export interface JobCardSpareJson {
  id?: string;
  description: string;
  qty: number | string;
  rate: number | string;
  amount: number | string;
}
