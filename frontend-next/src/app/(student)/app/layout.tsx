"use client";

import * as React from "react";
import { SpaceDashboardOutlinedIcon, MenuBookOutlinedIcon, AssignmentOutlinedIcon, TimerOutlinedIcon, WorkOutlineOutlinedIcon, LeaderboardOutlinedIcon, SmartToyOutlinedIcon, CodeOutlinedIcon, FormatListBulletedOutlinedIcon, HistoryOutlinedIcon } from "@/components/ui/icons";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell, type NavItem } from "@/components/shell/AppShell";

// Grouped by what the student is doing — learning, graded work, then progress —
// rather than by which feature built it.
//
// Not here on purpose:
//   Contests    — removed from the student experience (nobody used them).
//   My Classes  — reached from the My Class quick-access tile instead; joining a
//                 class is a once-ever action that doesn't deserve a permanent slot.
//   Submissions, Coding Profiles — tabs on Profile, via the avatar menu.
// Exams and Aptitude merge into a single "Tests" hub in a later phase.
const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/app/dashboard", icon: <SpaceDashboardOutlinedIcon /> },
  { label: "Courses", href: "/app/courses", icon: <MenuBookOutlinedIcon />, section: "Learn" },
  { label: "Practice", href: "/app/problems", icon: <FormatListBulletedOutlinedIcon />, section: "Learn" },
  { label: "Sandbox", href: "/app/sandbox", icon: <CodeOutlinedIcon />, section: "Learn" },
  { label: "Assignments", href: "/app/assignments", icon: <AssignmentOutlinedIcon />, section: "Work" },
  { label: "Tests", href: "/app/tests", icon: <TimerOutlinedIcon />, section: "Work" },
  { label: "Mistakes", href: "/app/mistakes", icon: <HistoryOutlinedIcon />, section: "Progress" },
  { label: "Leaderboard", href: "/app/leaderboard", icon: <LeaderboardOutlinedIcon />, section: "Progress" },
  { label: "Placement", href: "/app/placement", icon: <WorkOutlineOutlinedIcon />, section: "Progress" },
  { label: "AI Tutor", href: "/app/ai-tutor", icon: <SmartToyOutlinedIcon />, section: "Assistant" },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthGuard>
      <AppShell navItems={NAV_ITEMS} profileHref="/app/profile">
        {children}
      </AppShell>
    </AuthGuard>
  );
}
