"use client"

import { Fragment } from "react"
import { Check, X as XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { RepairRequestStatus } from "@/types/repairRequest"

/**
 * Horizontal progress stepper for a repair request: Submitted → Approved → In
 * Repair. Completed steps are filled + checked and coloured by stage (blue /
 * amber / green). Rejected and Cancelled are terminal: the line stops after
 * Submitted with a red ✕ or a grey marker. Mirrors the asset-request stepper.
 */

type NodeVariant = "done" | "pending" | "rejected" | "cancelled"

type StepNode = {
  label: string
  variant: NodeVariant
  fill?: string
  text: string
  connector: string
}

const GREY_CONNECTOR = "bg-gray-200"

function buildNodes(status: RepairRequestStatus, firstStepLabel: string): StepNode[] {
  const submittedDone: StepNode = {
    label: firstStepLabel, variant: "done",
    fill: "bg-blue-600 border-blue-600", text: "text-blue-700", connector: "",
  }

  if (status === "Rejected") {
    return [
      submittedDone,
      { label: "Rejected", variant: "rejected", fill: "bg-red-500 border-red-500", text: "text-red-600", connector: "bg-red-500" },
    ]
  }
  if (status === "Cancelled") {
    return [
      submittedDone,
      { label: "Cancelled", variant: "cancelled", fill: "bg-gray-400 border-gray-400", text: "text-gray-500", connector: GREY_CONNECTOR },
    ]
  }

  const approvedDone = status === "Approved" || status === "Fulfilled"
  const repairDone = status === "Fulfilled"

  const approved: StepNode = approvedDone
    ? { label: "Approved", variant: "done", fill: "bg-amber-500 border-amber-500", text: "text-amber-700", connector: "bg-amber-500" }
    : { label: "Approved", variant: "pending", text: "text-gray-400", connector: GREY_CONNECTOR }

  const repair: StepNode = repairDone
    ? { label: "In Repair", variant: "done", fill: "bg-green-600 border-green-600", text: "text-green-700", connector: "bg-green-600" }
    : { label: "In Repair", variant: "pending", text: "text-gray-400", connector: GREY_CONNECTOR }

  return [submittedDone, approved, repair]
}

/**
 * @param firstStepLabel label for the first step — "Submitted" (employee view,
 *        default) or "Requested" (admin queue view).
 */
export default function StatusStepper({
  status,
  firstStepLabel = "Submitted",
}: {
  status: RepairRequestStatus
  firstStepLabel?: string
}) {
  const nodes = buildNodes(status, firstStepLabel)
  return (
    <div className="flex items-start">
      {nodes.map((n, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={cn("mt-2 h-0.5 w-4 flex-none rounded", n.connector || GREY_CONNECTOR)} />}
          <div className="flex flex-col items-center gap-1 min-w-[52px]">
            <span
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-full border",
                n.variant === "pending" ? "border-gray-300 bg-white" : n.fill,
              )}
            >
              {n.variant === "done" && <Check className="h-2.5 w-2.5 text-white" />}
              {n.variant === "rejected" && <XIcon className="h-2.5 w-2.5 text-white" />}
              {n.variant === "cancelled" && <span className="h-1 w-1 rounded-full bg-white" />}
            </span>
            <span className={cn("text-[9px] font-medium leading-tight text-center whitespace-nowrap", n.text)}>
              {n.label}
            </span>
          </div>
        </Fragment>
      ))}
    </div>
  )
}
