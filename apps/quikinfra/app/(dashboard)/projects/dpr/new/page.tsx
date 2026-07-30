"use client";

/**
 * New Daily Progress Report — thin wrapper around the shared DPRForm.
 * The real layout + logic lives in DPRForm.tsx so /new and /[id]/edit
 * stay in perfect lock-step and Next.js App Router's strict page-export
 * rules are respected (only `default`, `metadata`, `generateMetadata`
 * etc. are allowed as named exports from a `page.tsx`).
 */

import { DPRForm } from "../components/DPRForm";

export default function NewDPRPage() {
  return <DPRForm />;
}
