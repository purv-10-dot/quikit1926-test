"use client";

import { useRouter, usePathname } from "next/navigation";
import { ArrowLeft } from "lucide-react";

const HIDE_PATTERNS: RegExp[] = [
  /^\/hrms$/,
  /^\/hrms\/employees\/[^/]+$/,
  /^\/hrms\/employees\/[^/]+\/edit$/,
  /^\/hrms\/assets\/[^/]+$/,
  /^\/hrms\/documents\/(?!my-vault|templates)[^/]+$/,
  /^\/hrms\/expenses\/[^/]+$/,
  /^\/hrms\/expenses\/reports$/,
  /^\/hrms\/offboarding\/[^/]+$/,
  /^\/hrms\/offboarding\/clearance\/[^/]+$/,
  /^\/hrms\/onboarding\/[^/]+$/,
  /^\/hrms\/onboarding\/candidates\/new$/,
  /^\/hrms\/reports\/generated$/,
];

export function BackButton() {
  const router = useRouter();
  const pathname = usePathname();

  if (HIDE_PATTERNS.some((re) => re.test(pathname))) return null;

  const handleBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/dashboard");
    }
  };

  return (
    <button
      type="button"
      onClick={handleBack}
      aria-label="Go back"
      className="inline-flex items-center gap-1.5 px-3 py-1.5 mb-4 text-[13px] font-semibold text-[#16243A] bg-[#16243A]/10 hover:bg-[#16243A] hover:text-white rounded-full transition-colors"
    >
      <ArrowLeft size={14} />
      Back
    </button>
  );
}
