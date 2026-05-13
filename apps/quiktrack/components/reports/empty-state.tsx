export function ReportsEmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16">
      <svg
        viewBox="0 0 200 140"
        className="w-44 h-32"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id="qt-empty-grad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#dbeafe" />
            <stop offset="100%" stopColor="#ede9fe" />
          </linearGradient>
        </defs>
        {/* desk */}
        <rect x="20" y="100" width="160" height="6" rx="2" fill="#e5e7eb" />
        {/* clipboard */}
        <rect x="62" y="28" width="76" height="78" rx="6" fill="url(#qt-empty-grad)" stroke="#c7d2fe" />
        <rect x="80" y="22" width="40" height="10" rx="3" fill="#a5b4fc" />
        {/* lines */}
        <rect x="74" y="48" width="52" height="5" rx="2" fill="#c7d2fe" />
        <rect x="74" y="60" width="40" height="5" rx="2" fill="#dbeafe" />
        <rect x="74" y="72" width="48" height="5" rx="2" fill="#dbeafe" />
        <rect x="74" y="84" width="32" height="5" rx="2" fill="#dbeafe" />
        {/* magnifying glass */}
        <circle cx="138" cy="86" r="14" fill="#fff" stroke="#94a3b8" strokeWidth="3" />
        <line x1="148" y1="96" x2="158" y2="106" stroke="#94a3b8" strokeWidth="3" strokeLinecap="round" />
        {/* sparkle */}
        <path d="M44 46 L48 50 L44 54 L40 50 Z" fill="#fbbf24" />
        <path d="M170 38 L173 41 L170 44 L167 41 Z" fill="#34d399" />
      </svg>
      <p className="mt-4 text-sm font-medium text-gray-700">{title}</p>
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}
