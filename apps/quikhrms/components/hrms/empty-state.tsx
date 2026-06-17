import { clsx } from "clsx";

interface EmptyStateProps {
  title?: string;
  description?: string;
  action?: React.ReactNode;
  variant?: "bot" | "search" | "inbox" | "calendar" | "folder";
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function EmptyState({
  title = "No Data Found",
  description,
  action,
  variant = "bot",
  size = "md",
  className,
}: EmptyStateProps) {
  const pad = size === "sm" ? "py-8" : size === "lg" ? "py-20" : "py-14";
  const illustrationSize = size === "sm" ? 120 : size === "lg" ? 220 : 180;

  return (
    <div className={clsx("bg-white rounded-lg border border-gray-200 flex flex-col items-center justify-center", pad, className)}>
      <Illustration variant={variant} size={illustrationSize} />
      <h3 className="text-base font-semibold text-gray-800 mt-4">{title}</h3>
      {description && <p className="text-sm text-gray-500 mt-1 max-w-md text-center">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

function Illustration({ variant, size }: { variant: string; size: number }) {
  if (variant === "bot") return <BotSVG size={size} />;
  if (variant === "search") return <SearchSVG size={size} />;
  if (variant === "inbox") return <InboxSVG size={size} />;
  if (variant === "calendar") return <CalendarSVG size={size} />;
  return <FolderSVG size={size} />;
}

function BotSVG({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="120" cy="160" rx="95" ry="10" fill="#EFF6FF" />
      <circle cx="185" cy="45" r="3" fill="#C7D2FE" />
      <circle cx="50" cy="55" r="2" fill="#C7D2FE" />
      <circle cx="200" cy="100" r="2.5" fill="#C7D2FE" />
      <circle cx="40" cy="110" r="2" fill="#C7D2FE" />
      <line x1="120" y1="28" x2="120" y2="48" stroke="#93C5FD" strokeWidth="2" strokeLinecap="round" />
      <circle cx="120" cy="24" r="4" fill="#F87171" />
      <rect x="75" y="50" width="90" height="85" rx="18" fill="#E0E7FF" />
      <rect x="82" y="65" width="76" height="55" rx="12" fill="#FFFFFF" stroke="#C7D2FE" strokeWidth="2" />
      <circle cx="103" cy="90" r="6" fill="#4F46E5" />
      <circle cx="137" cy="90" r="6" fill="#4F46E5" />
      <circle cx="105" cy="88" r="2" fill="#FFFFFF" />
      <circle cx="139" cy="88" r="2" fill="#FFFFFF" />
      <rect x="108" y="105" width="24" height="3" rx="1.5" fill="#93C5FD" />
      <rect x="60" y="80" width="15" height="30" rx="6" fill="#A5B4FC" />
      <rect x="165" y="80" width="15" height="30" rx="6" fill="#A5B4FC" />
      <rect x="90" y="135" width="60" height="12" rx="4" fill="#6366F1" />
      <circle cx="100" cy="141" r="2" fill="#FFF" />
      <circle cx="140" cy="141" r="2" fill="#FFF" />
    </svg>
  );
}

function SearchSVG({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="120" cy="160" rx="95" ry="10" fill="#EFF6FF" />
      <rect x="60" y="50" width="120" height="80" rx="10" fill="#E0E7FF" />
      <rect x="70" y="62" width="100" height="10" rx="4" fill="#FFFFFF" />
      <rect x="70" y="80" width="70" height="6" rx="3" fill="#C7D2FE" />
      <rect x="70" y="92" width="85" height="6" rx="3" fill="#C7D2FE" />
      <rect x="70" y="104" width="55" height="6" rx="3" fill="#C7D2FE" />
      <circle cx="170" cy="120" r="28" fill="#FFFFFF" stroke="#6366F1" strokeWidth="5" />
      <line x1="190" y1="140" x2="208" y2="158" stroke="#4F46E5" strokeWidth="6" strokeLinecap="round" />
      <circle cx="165" cy="115" r="4" fill="#6366F1" />
    </svg>
  );
}

function InboxSVG({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="120" cy="160" rx="95" ry="10" fill="#EFF6FF" />
      <path d="M60 70 L120 40 L180 70 L180 135 Q180 145 170 145 L70 145 Q60 145 60 135 Z" fill="#E0E7FF" />
      <rect x="75" y="100" width="90" height="15" rx="4" fill="#6366F1" />
      <rect x="85" y="82" width="70" height="14" rx="3" fill="#FFFFFF" stroke="#C7D2FE" strokeWidth="2" />
      <circle cx="120" cy="90" r="3" fill="#93C5FD" />
    </svg>
  );
}

function CalendarSVG({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="120" cy="160" rx="95" ry="10" fill="#EFF6FF" />
      <rect x="60" y="50" width="120" height="95" rx="10" fill="#FFFFFF" stroke="#C7D2FE" strokeWidth="2" />
      <rect x="60" y="50" width="120" height="25" rx="10" fill="#6366F1" />
      <circle cx="85" cy="62" r="3" fill="#FFFFFF" />
      <circle cx="155" cy="62" r="3" fill="#FFFFFF" />
      <rect x="72" y="85" width="12" height="12" rx="2" fill="#E0E7FF" />
      <rect x="92" y="85" width="12" height="12" rx="2" fill="#E0E7FF" />
      <rect x="112" y="85" width="12" height="12" rx="2" fill="#F87171" />
      <rect x="132" y="85" width="12" height="12" rx="2" fill="#E0E7FF" />
      <rect x="152" y="85" width="12" height="12" rx="2" fill="#E0E7FF" />
      <rect x="72" y="105" width="12" height="12" rx="2" fill="#E0E7FF" />
      <rect x="92" y="105" width="12" height="12" rx="2" fill="#E0E7FF" />
      <rect x="112" y="105" width="12" height="12" rx="2" fill="#E0E7FF" />
      <rect x="132" y="105" width="12" height="12" rx="2" fill="#E0E7FF" />
      <rect x="152" y="105" width="12" height="12" rx="2" fill="#E0E7FF" />
      <rect x="72" y="125" width="12" height="12" rx="2" fill="#E0E7FF" />
      <rect x="92" y="125" width="12" height="12" rx="2" fill="#E0E7FF" />
    </svg>
  );
}

function FolderSVG({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 240 180" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="120" cy="160" rx="95" ry="10" fill="#EFF6FF" />
      <path d="M50 70 Q50 55 65 55 L100 55 L110 65 L175 65 Q190 65 190 80 L190 130 Q190 145 175 145 L65 145 Q50 145 50 130 Z" fill="#FCD34D" />
      <path d="M50 80 L190 80 L190 130 Q190 145 175 145 L65 145 Q50 145 50 130 Z" fill="#FBBF24" />
      <rect x="90" y="95" width="60" height="40" rx="3" fill="#FFFFFF" stroke="#D97706" strokeWidth="2" />
      <line x1="100" y1="108" x2="140" y2="108" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
      <line x1="100" y1="118" x2="130" y2="118" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
      <line x1="100" y1="128" x2="135" y2="128" stroke="#D97706" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
