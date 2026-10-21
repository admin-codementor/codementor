"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { CalendarView } from "@/components/calendar/CalendarView";

export default function FacultyCalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" subtitle="Assignment deadlines, exam windows and course unit dates for what you run." />
      <CalendarView />
    </>
  );
}
