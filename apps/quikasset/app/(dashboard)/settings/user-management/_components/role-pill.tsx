"use client";

import { cn } from "@/lib/utils";
import { roleColor } from "./shared";

/** Small coloured chip for an app-role name. */
export function RolePill({ name, className }: { name: string | null; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold capitalize",
        roleColor(name),
        className,
      )}
    >
      {name ?? "No role"}
    </span>
  );
}
