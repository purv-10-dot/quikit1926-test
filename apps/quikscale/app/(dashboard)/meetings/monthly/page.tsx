"use client";

import { MeetingCadenceList } from "../components/MeetingCadenceList";

export default function MonthlyMeetingsPage() {
  return (
    <MeetingCadenceList
      cadence="monthly"
      title="Monthly Management Meeting"
      subtitle="Half-day learning session — culture, skill-building, coaching"
    />
  );
}
