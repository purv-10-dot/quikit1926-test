"use client";

import type { LucideIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useApiClient } from "@/lib/hooks/use-api";
import { Sparkles, Megaphone, Trophy, Users, MessageSquare } from "lucide-react";
import { PageBackground } from "@/components/hrms/page-background";
import { ShoutoutComposer } from "../../dashboard/_home/shoutout-composer";
import { SocialFeed } from "../../dashboard/_home/social-feed";

interface PostItem {
  id: string;
  type: string;
  likes: string[] | null;
  _count: { comments: number };
}

interface RecognitionItem {
  id: string;
  type: string;
}

interface AnnouncementItem {
  id: string;
}

export default function SocialWallPage() {
  const api = useApiClient();

  const { data: postsRes } = useQuery({
    queryKey: ["social-posts-stats"],
    queryFn: () => api.get<PostItem[]>("/api/v1/hrms/engage/social?limit=200"),
    staleTime: 60_000,
  });
  const { data: recRes } = useQuery({
    queryKey: ["social-recognitions-stats"],
    queryFn: () => api.get<RecognitionItem[]>("/api/v1/hrms/engage/recognition?limit=200"),
    staleTime: 60_000,
  });
  const { data: annRes } = useQuery({
    queryKey: ["social-announcements-stats"],
    queryFn: () => api.get<{ count: number }>("/api/v1/hrms/engage/announcements/active"),
    staleTime: 60_000,
  });

  const posts = postsRes?.data ?? [];
  const recognitions = recRes?.data ?? [];
  const totalLikes = posts.reduce((s, p) => s + ((p.likes as string[])?.length ?? 0), 0);
  const totalComments = posts.reduce((s, p) => s + (p._count?.comments ?? 0), 0);
  const totalAnnouncements = annRes?.data?.count ?? 0;

  return (
    <div>
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      {/* Hero header */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#0F1F3D] via-[#14532d] to-[#16a34a] mb-4">
        <svg className="absolute inset-0 w-full h-full opacity-40" viewBox="0 0 1200 200" preserveAspectRatio="none">
          <defs>
            <radialGradient id="sw-glow" cx="0.85" cy="0.5" r="0.5">
              <stop offset="0%" stopColor="#4ade80" stopOpacity="0.4" />
              <stop offset="100%" stopColor="#14532d" stopOpacity="0" />
            </radialGradient>
          </defs>
          <ellipse cx="1000" cy="100" rx="280" ry="180" fill="url(#sw-glow)" />
          <g stroke="#bbf7d0" strokeWidth="1" fill="none" opacity="0.4">
            <path d="M 500 80 Q 700 40 900 80 T 1300 80" />
            <path d="M 480 110 Q 700 70 920 110 T 1300 110" />
            <path d="M 460 140 Q 700 100 940 140 T 1300 140" />
          </g>
        </svg>
        <div className="relative px-6 py-7 flex items-center justify-between gap-6">
          <div>
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-white/15 backdrop-blur-sm ring-1 ring-white/20 text-[11px] font-semibold tracking-widest text-white/90 uppercase">
              <Sparkles size={12} /> Social Wall
            </div>
            <h1 className="font-serif-display text-white text-base font-semibold mt-3">
              Connect with your team
            </h1>
            <p className="text-white/75 text-xs mt-1">Share updates, give kudos, run polls, celebrate wins.</p>
          </div>
          <div className="hidden md:flex items-center justify-center w-24 h-24 rounded-2xl bg-white/10 backdrop-blur-md ring-1 ring-white/20 shadow-2xl shrink-0">
            <Sparkles size={36} className="text-white/90" />
          </div>
        </div>
      </div>

      {/* Stat strip */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
        <StatCard iconBg="bg-green-50" iconColor="text-green-600" Icon={Sparkles} label="Posts" value={posts.length} caption="On the wall" />
        <StatCard iconBg="bg-amber-50" iconColor="text-amber-600" Icon={Trophy} label="Kudos" value={recognitions.length} caption="Given so far" />
        <StatCard iconBg="bg-rose-50" iconColor="text-rose-500" Icon={Users} label="Likes" value={totalLikes} caption="Across all posts" />
        <StatCard iconBg="bg-violet-50" iconColor="text-violet-600" Icon={Megaphone} label="Announcements" value={totalAnnouncements} caption="Currently active" />
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <ShoutoutComposer />
          <SocialFeed />
        </div>

        <aside className="space-y-4">
          <div className="surface-card p-4">
            <h3 className="text-[13px] font-semibold text-gray-900 mb-3 flex items-center gap-2">
              <MessageSquare size={14} className="text-green-600" /> Engagement
            </h3>
            <ul className="space-y-3">
              <Stat row label="Total comments" value={totalComments} />
              <Stat row label="Total likes" value={totalLikes} />
              <Stat row label="Total posts" value={posts.length} />
              <Stat row label="Total kudos" value={recognitions.length} />
            </ul>
          </div>

          <div className="surface-card p-4">
            <h3 className="text-[13px] font-semibold text-gray-900 mb-2">Posting tips</h3>
            <ul className="text-xs text-gray-600 space-y-1.5 list-disc list-inside">
              <li>Use @mentions to tag teammates.</li>
              <li>Pin important updates so they stay on top.</li>
              <li>Give kudos to recognise great work.</li>
              <li>Add polls to get quick team input.</li>
            </ul>
          </div>
        </aside>
      </div>
    </div>
  );
}

function StatCard({
  iconBg, iconColor, Icon, label, value, caption,
}: {
  iconBg: string;
  iconColor: string;
  Icon: LucideIcon;
  label: string;
  value: number;
  caption: string;
}) {
  return (
    <div className="surface-card p-4 flex items-start gap-3">
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${iconBg}`}>
        <Icon size={20} className={iconColor} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-[13px] font-semibold text-gray-900 truncate">{label}</p>
        <p className="font-serif-display text-xl font-bold text-gray-900 leading-tight mt-0.5">{value}</p>
        <p className="text-[11px] text-gray-500 truncate">{caption}</p>
      </div>
    </div>
  );
}

function Stat({ row, label, value }: { row?: boolean; label: string; value: number }) {
  return (
    <li className="flex items-center justify-between gap-2 text-xs">
      <span className="text-gray-600">{label}</span>
      <span className="font-bold text-gray-900">{value}</span>
    </li>
  );
}
