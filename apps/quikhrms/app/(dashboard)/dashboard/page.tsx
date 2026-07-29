"use client";

import { HeroBanner } from "./_home/hero-banner";
import { RecentlyAssigned } from "./_home/recently-assigned";
import { ShoutoutComposer } from "./_home/shoutout-composer";
import { SocialFeed } from "./_home/social-feed";
import {
  AttendanceWidget,
  EssentialsWidget,
  AnnouncementsWidget,
} from "./_home/right-sidebar";
import {
  ScheduleSection,
  JobOpeningsWidget,
} from "./_home/dashboard-widgets";
import { DeferredSection } from "@/components/hrms/deferred-section";
import { PageBackground } from "@/components/hrms/page-background";

export default function HRMSHomePage() {
  return (
    <div className="w-full px-4 lg:px-6 pb-8">
      {/* Subtle HR-themed page background (scoped to this page only). */}
      <PageBackground src="/images/pre-onboarding-bg.png" />
      {/* Greeting — with a soft decorative backdrop */}
      <div className="relative overflow-hidden rounded-2xl mb-5">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute inset-0 bg-gradient-to-r from-green-50 via-sky-50/40 to-transparent" />
          <svg viewBox="0 0 640 140" preserveAspectRatio="xMinYMax meet" className="absolute bottom-0 left-0 h-28 w-[520px] max-w-[55%] text-green-100/70" fill="currentColor">
            <rect x="8" y="70" width="34" height="70" /><rect x="50" y="48" width="26" height="92" /><rect x="84" y="86" width="30" height="54" />
            <rect x="122" y="58" width="24" height="82" /><rect x="154" y="78" width="34" height="62" /><rect x="196" y="40" width="26" height="100" />
            <rect x="230" y="72" width="30" height="68" /><rect x="268" y="60" width="24" height="80" /><rect x="300" y="90" width="34" height="50" />
            <rect x="342" y="66" width="26" height="74" /><rect x="376" y="52" width="30" height="88" />
          </svg>
          <span className="absolute bottom-2 left-[40%] text-3xl select-none opacity-90">🌿</span>
        </div>
        <div className="relative px-4 lg:px-5 pt-2 pb-4">
          <HeroBanner />
        </div>
      </div>

      <div className="relative z-10">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left column */}
          <div className="lg:col-span-8 space-y-5">
            {/* Quick actions + Today's attendance — side by side at the top */}
            <div className="grid grid-cols-1 lg:grid-cols-[1.5fr_1fr] gap-5 items-stretch">
              <EssentialsWidget />
              <AttendanceWidget />
            </div>
            {/* Upcoming Schedule — calendar, events, stats, and celebrations in one card */}
            <DeferredSection>
              <ScheduleSection />
            </DeferredSection>
            <DeferredSection>
              <JobOpeningsWidget />
            </DeferredSection>
            <DeferredSection>
              <ShoutoutComposer />
            </DeferredSection>
            <DeferredSection>
              <SocialFeed />
            </DeferredSection>
          </div>

          {/* Right column — sticks below the (sticky, translucent) top bar on
              scroll so its content never slides under the frosted header. */}
          <aside className="lg:col-span-4 space-y-5 lg:sticky lg:top-[72px] lg:self-start">
            <RecentlyAssigned />
            <DeferredSection>
              <AnnouncementsWidget />
            </DeferredSection>
          </aside>
        </div>
      </div>
    </div>
  );
}
