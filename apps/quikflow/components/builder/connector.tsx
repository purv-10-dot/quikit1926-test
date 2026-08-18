import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Connector drawn between two node cards: a thin line with a directional
 * chevron. `horizontal` (default) is used by the left→right builder canvas;
 * `vertical` is used by the read-only workflow-detail column.
 */
export function Connector({ direction = "horizontal" }: { direction?: "horizontal" | "vertical" }) {
  if (direction === "vertical") {
    return (
      <div className="flex flex-col items-center py-1" aria-hidden="true">
        <span className="h-5 w-px bg-[var(--color-border)]" />
        <ChevronDown className="-my-1 h-4 w-4 text-gray-400" />
        <span className="h-5 w-px bg-[var(--color-border)]" />
      </div>
    );
  }
  return (
    <div className={cn("flex shrink-0 items-center px-1")} aria-hidden="true">
      <span className="h-px w-5 bg-[var(--color-border)]" />
      <ChevronRight className="-mx-1 h-4 w-4 text-gray-400" />
      <span className="h-px w-5 bg-[var(--color-border)]" />
    </div>
  );
}
