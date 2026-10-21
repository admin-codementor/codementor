"use client";

import { PageHeader } from "@/components/ui/PageHeader";
import { CalendarView } from "@/components/calendar/CalendarView";

export default function StudentCalendarPage() {
  return (
    <>
      <PageHeader title="Calendar" subtitle="Deadlines, exams and when course units open or are due." />
      <CalendarView />
    </>
  );
}
