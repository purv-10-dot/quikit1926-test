"use client";

import { Check, Circle } from "lucide-react";
import { passwordRequirements } from "@/lib/validations/auth";

/** Live password-policy checklist. Rules are always shown; each turns green
 *  once satisfied so the user knows the policy up front. */
export function PasswordRequirements({ value }: { value: string }) {
  return (
    <ul className="mt-2 space-y-1">
      {passwordRequirements.map((r) => {
        const ok = r.test(value);
        return (
          <li
            key={r.label}
            className={`flex items-center gap-1.5 text-[12.5px] font-medium ${
              ok ? "text-emerald-600" : "text-gray-400"
            }`}
          >
            {ok ? <Check size={13} /> : <Circle size={9} className="mx-[2px]" />}
            {r.label}
          </li>
        );
      })}
    </ul>
  );
}
