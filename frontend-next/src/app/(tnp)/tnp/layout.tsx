"use client";

import * as React from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell, type NavItem } from "@/components/shell/AppShell";
import { AssignmentOutlinedIcon, BusinessOutlinedIcon, DownloadOutlinedIcon, GroupsOutlinedIcon, InsightsOutlinedIcon, SpaceDashboardOutlinedIcon, WorkOutlineOutlinedIcon } from "@/components/ui/icons";
import { getRole } from "@/lib/auth";

// The Training & Placement office. Every item calls routes that the office may use (see backend/src/config/accessMatrix.js).
const NAV: NavItem[] = [
  { label: "Drives", href: "/tnp/drives", icon: <WorkOutlineOutlinedIcon />, section: "Placements" },
  { label: "Students and CGPA", href: "/tnp/students", icon: <GroupsOutlinedIcon />, section: "Placements" },
  { label: "Outside offers", href: "/tnp/outside", icon: <BusinessOutlinedIcon />, section: "Placements" },
  { label: "Analytics", href: "/tnp/analytics", icon: <InsightsOutlinedIcon />, section: "Reports" },
  { label: "Export", href: "/tnp/export", icon: <DownloadOutlinedIcon />, section: "Reports" },
  { label: "Exams", href: "/tnp/exams", icon: <AssignmentOutlinedIcon />, section: "Support" },
];

// The Admin may use these screens too and needs a way back to the console.
const ADMIN_BACK: NavItem = { label: "Back to the console", href: "/faculty/dashboard", icon: <SpaceDashboardOutlinedIcon />, section: "Administration" };

export default function TnpLayout({ children }: { children: React.ReactNode }) {
  const [items, setItems] = React.useState<NavItem[]>(NAV);
  React.useEffect(() => { setItems(getRole() === "admin" ? [...NAV, ADMIN_BACK] : NAV); }, []);
  return (
    <AuthGuard roles={["tnp", "admin"]}>
      <AppShell navItems={items} profileHref="/tnp/profile">{children}</AppShell>
    </AuthGuard>
  );
}
