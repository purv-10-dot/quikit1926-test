"use client";

import { MeetingCadenceList } from "../components/MeetingCadenceList";

export default function QuarterlyMeetingsPage() {
  return (
    <MeetingCadenceList
      cadence="quarterly"
      title="Quarterly Offsite"
      subtitle="1-2 day strategic review — close prior quarter, set new priorities, update OPSP"
    />
  );
}
