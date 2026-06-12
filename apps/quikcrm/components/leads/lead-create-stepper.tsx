"use client";

import { Check } from "lucide-react";
import { LEAD_FORM_STEPS } from "@/lib/leads/lead-form-steps";

export function LeadCreateStepper({
  currentStep,
  onStepClick,
  steps = LEAD_FORM_STEPS,
}: {
  currentStep: number;
  /** Navigate to a completed step (index must be &lt; currentStep). */
  onStepClick?: (step: number) => void;
  /** Defaults to LEAD_FORM_STEPS. Pass a dynamic array when an extra
   *  conditional step (e.g. "Other Information") is active. */
  steps?: ReadonlyArray<{ id: string; label: string }>;
}) {
  return (
    <nav aria-label="Lead creation progress" className="mb-6 overflow-x-auto pb-1">
      <ol className="flex min-w-[36rem] items-start gap-0">
        {steps.map((step, index) => {
          const isCurrent = index === currentStep;
          const isCompleted = index < currentStep;
          const isFuture = index > currentStep;
          const canNavigate = isCompleted && onStepClick;

          return (
            <li
              key={step.id}
              className="flex min-w-0 flex-1 flex-col items-center"
              aria-current={isCurrent ? "step" : undefined}
            >
              <div className="flex w-full items-center">
                {index > 0 ? (
                  <div
                    className={`h-0.5 flex-1 ${isCompleted ? "bg-blue-500" : isCurrent ? "bg-blue-300" : "bg-gray-200"}`}
                    aria-hidden
                  />
                ) : (
                  <div className="flex-1" aria-hidden />
                )}
                <button
                  type="button"
                  disabled={!canNavigate}
                  onClick={() => canNavigate && onStepClick(index)}
                  className={[
                    "relative z-[1] flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold transition-colors",
                    isCurrent
                      ? "bg-accent-600 text-white ring-4 ring-accent-100"
                      : isCompleted
                        ? "bg-blue-600 text-white hover:bg-blue-700"
                        : "bg-gray-200 text-gray-500",
                    canNavigate ? "cursor-pointer" : "cursor-default",
                  ].join(" ")}
                  aria-label={`${step.label}${isCurrent ? " (current)" : isCompleted ? " (completed)" : ""}`}
                >
                  {isCompleted ? <Check className="h-4 w-4" strokeWidth={3} aria-hidden /> : index + 1}
                </button>
                {index < steps.length - 1 ? (
                  <div
                    className={`h-0.5 flex-1 ${isCompleted ? "bg-blue-500" : "bg-gray-200"}`}
                    aria-hidden
                  />
                ) : (
                  <div className="flex-1" aria-hidden />
                )}
              </div>
              <p
                className={[
                  "mt-2 max-w-[7.5rem] text-center text-[10px] font-medium leading-tight sm:max-w-none sm:text-xs",
                  isCurrent ? "text-accent-700" : isFuture ? "text-gray-400" : "text-crm-text",
                ].join(" ")}
              >
                {step.label}
              </p>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
