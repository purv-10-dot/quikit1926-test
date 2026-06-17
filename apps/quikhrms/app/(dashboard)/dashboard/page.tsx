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
import {
  QuickLinksWidget,
  MobileAppWidget,
} from "./_home/extra-widgets";
import { DeferredSection } from "@/components/hrms/deferred-section";

export default function HRMSHomePage() {
  return (
    <div>
      {/* Full-bleed hero */}
      <HeroBanner />

      <div className="w-full px-4 lg:px-6 -mt-20 relative z-10 pb-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Left column */}
          <div className="lg:col-span-8 space-y-5">
            <RecentlyAssigned />
            <DeferredSection>
              <HolidaysWidget />
            </DeferredSection>
            <DeferredSection>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
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

          {/* Right column */}
          <aside className="lg:col-span-4 space-y-5">
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
              <QuickLinksWidget />
            </DeferredSection>
            <DeferredSection>
              <MobileAppWidget />
            </DeferredSection>
          </aside>
        </div>
      </div>
    </div>
  );
}
