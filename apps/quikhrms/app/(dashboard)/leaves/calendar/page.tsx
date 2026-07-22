import { redirect } from "next/navigation";

// The Leave & Holiday Calendar view was consolidated into the Holiday Calendar
// (/holidays), which has the preferred layout. Redirect so existing links/
// bookmarks continue to work.
export default function LeaveCalendarPage() {
  redirect("/holidays");
}
