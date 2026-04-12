"use client";

import { MeetingCadenceList } from "../components/MeetingCadenceList";

export default function AnnualMeetingsPage() {
  return (
    <MeetingCadenceList
      cadence="annual"
      title="Annual Planning"
      subtitle="1-3 day offsite — refresh 3-5yr vision, BHAG, core values, 1-year goals"
    />
  );
}
