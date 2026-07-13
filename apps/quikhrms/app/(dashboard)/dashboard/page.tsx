"use client";

import { HeroBanner } from "./_home/hero-banner";
import { RecentlyAssigned } from "./_home/recently-assigned";
import { ShoutoutComposer } from "./_home/shoutout-composer";
import { SocialFeed } from "./_home/social-feed";
import {
  ProfileCardWidget,
  AttendanceWidget,
  EssentialsWidget,
  AnnouncementsWidget,
} from "./_home/right-sidebar";
import {
  HolidaysWidget,
  BirthdaysWidget,
  AnniversariesWidget,
  HomeStatRow,
  JobOpeningsWidget,
} from "./_home/dashboard-widgets";
import { MobileAppWidget } from "./_home/extra-widgets";
import { DeferredSection } from "@/components/hrms/deferred-section";

export default function HRMSHomePage() {
  return (
    <div>
      {/* Full-bleed hero */}
      <HeroBanner />

      <div className="w-full px-4 lg:px-5 relative z-10 pb-4">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          {/* Left column */}
          <div className="lg:col-span-8 space-y-4">
            <RecentlyAssigned />
            <DeferredSection>
              <HolidaysWidget />
            </DeferredSection>
            <DeferredSection>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <BirthdaysWidget />
                <AnniversariesWidget />
              </div>
            </DeferredSection>
            <DeferredSection>
              <HomeStatRow />
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
          <aside className="lg:col-span-4 space-y-4 lg:sticky lg:top-[72px] lg:self-start">
            <ProfileCardWidget />
            <AttendanceWidget />
            <DeferredSection>
              <EssentialsWidget />
            </DeferredSection>
            <DeferredSection>
              <AnnouncementsWidget />
            </DeferredSection>
            {/* AI Copilot widget hidden for now. */}
            <DeferredSection>
              <MobileAppWidget />
            </DeferredSection>
          </aside>
        </div>
      </div>
    </div>
  );
}
