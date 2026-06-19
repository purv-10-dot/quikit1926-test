"use client";

import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";

interface Me {
  id: string;
  firstName: string;
  lastName: string;
  displayName: string | null;
}

interface Company {
  companyName: string;
  logo: string | null;
}

export function HeroBanner() {
  const api = useApiClient();
  const { data: meRes } = useQuery({
    queryKey: ["me", "home-hero"],
    queryFn: () => api.get<Me>("/api/v1/hrms/employees/me"),
    staleTime: 5 * 60_000,
  });
  const { data: companyRes } = useQuery({
    queryKey: ["settings", "company-hero"],
    queryFn: () => api.get<Company>("/api/v1/hrms/settings/company"),
    staleTime: 5 * 60_000,
  });
  const me = meRes?.data;
  const company = companyRes?.data;
  const firstName = me ? (me.displayName ?? `${me.firstName} ${me.lastName}`) : "there";
  const initials = company?.companyName
    ? company.companyName.split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase()
    : "Qb";

  return (
    <div className="relative overflow-hidden rounded-3xl mx-4 lg:mx-6">
      {/* Deep navy → blue gradient */}
      <div className="absolute inset-0 bg-gradient-to-br from-[#0A1733] via-[#15296B] to-[#1E40AF]" />

      {/* Background SVG decorations */}
      <svg className="absolute inset-0 w-full h-full" viewBox="0 0 1600 400" preserveAspectRatio="xMidYMid slice">
        <defs>
          <radialGradient id="hero-glow" cx="0.78" cy="0.4" r="0.55">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#1e3a8a" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hero-blob" cx="0.92" cy="0.65" r="0.4">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#0A1733" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="hero-soft-left" cx="0.05" cy="0.95" r="0.45">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.22" />
            <stop offset="100%" stopColor="#0A1733" stopOpacity="0" />
          </radialGradient>
          <linearGradient id="hero-wave" x1="0" y1="0" x2="1" y2="0.3">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0" />
            <stop offset="50%" stopColor="#93c5fd" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#bfdbfe" stopOpacity="0.15" />
          </linearGradient>
          <pattern id="hero-dots" x="0" y="0" width="14" height="14" patternUnits="userSpaceOnUse">
            <circle cx="2" cy="2" r="1.2" fill="#bfdbfe" fillOpacity="0.55" />
          </pattern>
        </defs>

        {/* Soft glows */}
        <rect width="1600" height="400" fill="url(#hero-glow)" />
        <ellipse cx="1480" cy="260" rx="380" ry="280" fill="url(#hero-blob)" />
        <ellipse cx="80" cy="380" rx="320" ry="220" fill="url(#hero-soft-left)" />

        {/* Flowing wave lines (right side) */}
        <g stroke="url(#hero-wave)" strokeWidth="1.2" fill="none" opacity="0.7">
          <path d="M 700 260 Q 920 200 1140 240 T 1560 220" />
          <path d="M 720 290 Q 940 230 1160 270 T 1580 250" />
          <path d="M 740 320 Q 960 260 1180 300 T 1600 280" />
          <path d="M 760 350 Q 980 290 1200 330 T 1620 310" />
          <path d="M 780 220 Q 1000 160 1220 200 T 1640 180" />
          <path d="M 800 380 Q 1020 320 1240 360 T 1660 340" />
        </g>

        {/* Concentric ring (mid-left) */}
        <g stroke="#93c5fd" strokeWidth="1" fill="none" opacity="0.5">
          <circle cx="1080" cy="160" r="50" />
          <circle cx="1080" cy="160" r="80" opacity="0.35" />
        </g>

        {/* Small ring accent */}
        <circle cx="660" cy="340" r="22" stroke="#93c5fd" strokeWidth="1" fill="none" opacity="0.4" />

        {/* Dotted grids */}
        <rect x="1180" y="40" width="140" height="84" fill="url(#hero-dots)" opacity="0.7" />
        <rect x="1480" y="320" width="100" height="56" fill="url(#hero-dots)" opacity="0.6" />
        <rect x="40" y="20" width="84" height="56" fill="url(#hero-dots)" opacity="0.35" />
      </svg>

      <div className="relative w-full px-8 lg:px-12 pt-8 pb-24 flex items-center justify-between gap-8 min-h-[240px]">
        <div className="flex-1 min-w-0">
          <h1 className="font-serif-display text-white text-[44px] lg:text-[60px] leading-[1.05] font-bold tracking-tight">
            Hi {firstName},
          </h1>
          <h2 className="font-serif-display text-white/95 text-[34px] lg:text-[48px] leading-[1.1] font-semibold tracking-tight mt-1">
            glad you&apos;re here <span className="inline-block">👋</span>
          </h2>
          <p className="text-white/75 text-sm lg:text-base mt-3 font-medium">Here&apos;s what&apos;s happening today</p>
        </div>

        {/* Company logo tile */}
        <div className="hidden md:flex items-center justify-center w-32 h-32 lg:w-44 lg:h-44 rounded-3xl bg-white/10 backdrop-blur-md ring-1 ring-white/20 shrink-0 shadow-2xl relative overflow-hidden">
          <div className="absolute inset-0 bg-gradient-to-br from-white/15 to-transparent" />
          {company?.logo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={company.logo} alt={company.companyName} className="w-full h-full object-cover rounded-3xl relative" />
          ) : (
            <span className="relative font-serif-display text-white text-5xl lg:text-7xl font-bold tracking-tight">{initials}</span>
          )}
        </div>
      </div>
    </div>
  );
}
