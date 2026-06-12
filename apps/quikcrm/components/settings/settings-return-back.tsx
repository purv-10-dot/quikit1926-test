"use client";

import { ArrowLeft } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";

/** Back control for settings pages opened from lead forms (preserves ?returnTo). */
export function SettingsReturnBackButton() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");

  return (
    <button
      type="button"
      onClick={() => {
        if (returnTo) router.push(returnTo);
        else router.back();
      }}
      className="inline-flex items-center gap-1 text-sm text-crm-blue hover:underline"
    >
      <ArrowLeft size={14} /> Back
    </button>
  );
}
