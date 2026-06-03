"use client";

/**
 * New Work Order — thin wrapper around the shared WorkOrderForm.
 * The real layout + logic lives in WorkOrderForm.tsx so the /new and
 * /[id]/edit routes stay in perfect lock-step.
 */

import { WorkOrderForm } from "./WorkOrderForm";

export default function NewWorkOrderPage() {
  return <WorkOrderForm />;
}
