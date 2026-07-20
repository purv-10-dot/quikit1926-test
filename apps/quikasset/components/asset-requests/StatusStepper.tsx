"use client"

import { Fragment } from "react"
import { Check, X as XIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import type { AssetRequestStatus } from "@/types/assetRequest"

/**
 * Horizontal progress stepper for an asset request: Submitted → Approved →
 * Assigned. Completed steps are filled + checked and colored by stage (blue /
 * amber / green — the same semantic families as the status pills); the connector
 * into a step fills with that step's colour once it's reached. Rejected and
 * Cancelled are terminal: the line stops after Submitted with a red ✕ or a grey
 * marker. PartiallyFulfilled shows the Assigned step as an in-progress dot.
 */

type NodeVariant = "done" | "current" | "pending" | "rejected" | "cancelled"

type StepNode = {
  label: string
  variant: NodeVariant
  fill?: string       // solid circle (done / terminal)
  ring?: string       // outline ring (current)
  dot?: string        // inner dot colour (current)
  text: string        // label colour
  connector: string   // colour of the connector leading INTO this node
}

const GREY_CONNECTOR = "bg-gray-200"

function buildNodes(status: AssetRequestStatus, firstStepLabel: string): StepNode[] {
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

  const approvedDone = ["Approved", "PartiallyFulfilled", "Fulfilled"].includes(status)
  const assignedDone = status === "Fulfilled"
  const assignedPartial = status === "PartiallyFulfilled"

  const submitted: StepNode = status === "Draft"
    ? { label: firstStepLabel, variant: "pending", text: "text-gray-400", connector: "" }
    : submittedDone

  const approved: StepNode = approvedDone
    ? { label: "Approved", variant: "done", fill: "bg-amber-500 border-amber-500", text: "text-amber-700", connector: "bg-amber-500" }
    : { label: "Approved", variant: "pending", text: "text-gray-400", connector: GREY_CONNECTOR }

  const assigned: StepNode = assignedDone
    ? { label: "Assigned", variant: "done", fill: "bg-green-600 border-green-600", text: "text-green-700", connector: "bg-green-600" }
    : assignedPartial
      ? { label: "Partial", variant: "current", ring: "border-green-500", dot: "bg-green-600", text: "text-green-700", connector: "bg-green-600" }
      : { label: "Assigned", variant: "pending", text: "text-gray-400", connector: GREY_CONNECTOR }

  return [submitted, approved, assigned]
}

/**
 * @param firstStepLabel label for the first step — "Submitted" (employee's
 *        My Requests view, default) or "Requested" (admin queue view).
 */
export default function StatusStepper({
  status,
  firstStepLabel = "Submitted",
}: {
  status: AssetRequestStatus
  firstStepLabel?: string
}) {
  const nodes = buildNodes(status, firstStepLabel)
  return (
    <div className="flex items-start">
      {nodes.map((n, i) => (
        <Fragment key={i}>
          {i > 0 && <span className={cn("mt-2 h-0.5 w-4 flex-none rounded", n.connector || GREY_CONNECTOR)} />}
          <div className="flex flex-col items-center gap-1 min-w-[48px]">
            <span
              className={cn(
                "flex h-4 w-4 items-center justify-center rounded-full border",
                n.variant === "current"
                  ? cn("border-2 bg-white", n.ring)
                  : n.variant === "pending"
                    ? "border-gray-300 bg-white"
                    : n.fill,
              )}
            >
              {n.variant === "done" && <Check className="h-2.5 w-2.5 text-white" />}
              {n.variant === "rejected" && <XIcon className="h-2.5 w-2.5 text-white" />}
              {n.variant === "cancelled" && <span className="h-1 w-1 rounded-full bg-white" />}
              {n.variant === "current" && <span className={cn("h-1.5 w-1.5 rounded-full", n.dot)} />}
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
