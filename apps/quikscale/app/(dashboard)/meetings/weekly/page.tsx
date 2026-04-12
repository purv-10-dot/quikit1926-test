"use client";

import { MeetingCadenceList } from "../components/MeetingCadenceList";

export default function WeeklyMeetingsPage() {
  return (
    <MeetingCadenceList
      cadence="weekly"
      title="Weekly Meeting"
      subtitle="60-90 min per team — KPI review, priorities, stuck issues, WWW generation"
    />
  );
}
