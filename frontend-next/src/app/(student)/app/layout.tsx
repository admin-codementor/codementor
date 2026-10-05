"use client";

import * as React from "react";
import { SpaceDashboardOutlinedIcon, MenuBookOutlinedIcon, AssignmentOutlinedIcon, TimerOutlinedIcon, WorkOutlineOutlinedIcon, LeaderboardOutlinedIcon, SmartToyOutlinedIcon, CodeOutlinedIcon, FormatListBulletedOutlinedIcon, HistoryOutlinedIcon, WaypointsIcon, HomeOutlinedIcon } from "@/components/ui/icons";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell, type NavItem } from "@/components/shell/AppShell";
import { HomeShell } from "@/components/shell/HomeShell";

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
  // Home is the landing page: six illustrated tiles and nothing else. The
  // dashboard is a deliberate second click for the numbers.
  { label: "Home", href: "/app", icon: <HomeOutlinedIcon /> },
  { label: "Dashboard", href: "/app/dashboard", icon: <SpaceDashboardOutlinedIcon /> },
  { label: "Courses", href: "/app/courses", icon: <MenuBookOutlinedIcon />, section: "Learn" },
  { label: "Practice", href: "/app/problems", icon: <FormatListBulletedOutlinedIcon />, section: "Learn" },
  { label: "Roadmaps", href: "/app/roadmaps", icon: <WaypointsIcon />, section: "Learn" },
  { label: "Sandbox", href: "/app/sandbox", icon: <CodeOutlinedIcon />, section: "Learn" },
  { label: "Assignments", href: "/app/assignments", icon: <AssignmentOutlinedIcon />, section: "Work" },
  { label: "Tests", href: "/app/tests", icon: <TimerOutlinedIcon />, section: "Work" },
  { label: "Mistakes", href: "/app/mistakes", icon: <HistoryOutlinedIcon />, section: "Progress" },
  { label: "Leaderboard", href: "/app/leaderboard", icon: <LeaderboardOutlinedIcon />, section: "Progress" },
  // The route keeps its old path so existing links still work; the label
  // matches what the page is now called.
  { label: "Job-Ready", href: "/app/placement", icon: <WorkOutlineOutlinedIcon />, section: "Progress" },
  { label: "AI Tutor", href: "/app/ai-tutor", icon: <SmartToyOutlinedIcon />, section: "Assistant" },
];

export default function StudentLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Home gets a top bar and no sidebar; everything reached from it gets the
  // full shell. Never both at once — two sets of destinations for the same six
  // places reads as a menu attached to a menu.
  const isHome = pathname === "/app";

  return (
    <AuthGuard>
      {isHome ? (
        <HomeShell profileHref="/app/profile">{children}</HomeShell>
      ) : (
        <AppShell navItems={NAV_ITEMS} profileHref="/app/profile">
          {children}
        </AppShell>
      )}
    </AuthGuard>
  );
}
