import { Check } from "lucide-react";

const TONE_CLASSES: Record<"blue" | "green" | "amber", { bg: string; border: string; iconBg: string; iconText: string; title: string; subtitle: string }> = {
  blue: {
    bg: "bg-blue-50", border: "border-blue-200", iconBg: "bg-blue-100", iconText: "text-blue-600",
    title: "text-blue-800", subtitle: "text-blue-600",
  },
  green: {
    bg: "bg-green-50", border: "border-green-200", iconBg: "bg-green-100", iconText: "text-green-600",
    title: "text-green-800", subtitle: "text-green-600",
  },
  amber: {
    bg: "bg-amber-50", border: "border-amber-200", iconBg: "bg-amber-100", iconText: "text-amber-600",
    title: "text-amber-800", subtitle: "text-amber-600",
  },
};

/**
 * Status banner used across OPSP surfaces (Create OPSP, OPSP Review) to tell
 * the user their finalize/lock state — same visual language (icon circle +
 * title + subtitle), tone/copy driven entirely by props so every surface can
 * reuse the exact same component instead of re-hardcoding the JSX.
 */
export function FinalizeStatusBanner({
  tone,
  title,
  subtitle,
}: {
  tone: "blue" | "green" | "amber";
  title: string;
  subtitle: string;
}) {
  const c = TONE_CLASSES[tone];
  return (
    <div className={`mx-6 mt-6 flex items-center gap-3 px-4 py-3 ${c.bg} border ${c.border} rounded-xl`}>
      <div className={`flex-shrink-0 w-8 h-8 rounded-full ${c.iconBg} flex items-center justify-center`}>
        <Check className={`h-4 w-4 ${c.iconText}`} />
      </div>
      <div>
        <p className={`text-sm font-semibold ${c.title}`}>{title}</p>
        <p className={`text-xs ${c.subtitle}`}>{subtitle}</p>
      </div>
    </div>
  );
}
