"use client";

import * as React from "react";
import { SpaceDashboardOutlinedIcon, MenuBookOutlinedIcon, EmojiEventsOutlinedIcon, AssignmentOutlinedIcon, PsychologyOutlinedIcon, SchoolOutlinedIcon, WorkOutlineOutlinedIcon, LeaderboardOutlinedIcon, SmartToyOutlinedIcon } from "@/components/ui/icons";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell, type NavItem } from "@/components/shell/AppShell";

// Submissions & Coding Profiles now live as tabs on the Profile page (reached via the avatar menu).
const NAV_ITEMS: NavItem[] = [
  { label: "Dashboard", href: "/app/dashboard", icon: <SpaceDashboardOutlinedIcon /> },
  { label: "Courses", href: "/app/courses", icon: <MenuBookOutlinedIcon />, section: "Practice" },
  { label: "Contests", href: "/app/contests", icon: <EmojiEventsOutlinedIcon />, section: "Practice" },
  { label: "Assignments", href: "/app/assignments", icon: <AssignmentOutlinedIcon />, section: "Practice" },
  { label: "Aptitude", href: "/app/aptitude", icon: <PsychologyOutlinedIcon />, section: "Practice" },
  { label: "Leaderboard", href: "/app/leaderboard", icon: <LeaderboardOutlinedIcon />, section: "Progress" },
  { label: "My Classes", href: "/app/classes", icon: <SchoolOutlinedIcon />, section: "Progress" },
  { label: "Placement", href: "/app/placement", icon: <WorkOutlineOutlinedIcon />, section: "Career" },
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
