"use client";

import * as React from "react";
import { usePathname, useRouter } from "next/navigation";
import { BusinessOutlinedIcon, GroupsOutlinedIcon, SpaceDashboardOutlinedIcon, InsightsOutlinedIcon, CodeOutlinedIcon, SchoolOutlinedIcon, QuizOutlinedIcon, AssignmentOutlinedIcon, PolicyOutlinedIcon, AdminPanelSettingsOutlinedIcon, MonitorHeartOutlinedIcon, ReceiptLongOutlinedIcon, LayersOutlinedIcon, MenuBookOutlinedIcon } from "@/components/ui/icons";
import { AuthGuard } from "@/components/auth/AuthGuard";
import { AppShell, type NavItem } from "@/components/shell/AppShell";
import { getRole } from "@/lib/auth";

// Staff sidebar, grouped by what the user is doing. Every item here is reachable
// by faculty, HOD and admin alike (backend `facultyStaff`), so none can 403.
const BASE_NAV: NavItem[] = [
  { label: "Dashboard", href: "/faculty/dashboard", icon: <SpaceDashboardOutlinedIcon />, section: "Overview" },
  { label: "Analytics", href: "/faculty/analytics", icon: <InsightsOutlinedIcon />, section: "Overview" },
  { label: "Courses", href: "/faculty/courses", icon: <MenuBookOutlinedIcon />, section: "Content" },
  { label: "Problems", href: "/faculty/problems", icon: <CodeOutlinedIcon />, section: "Content" },
  { label: "Question Bank", href: "/faculty/bank", icon: <LayersOutlinedIcon />, section: "Content" },
  { label: "Classes", href: "/faculty/classes", icon: <SchoolOutlinedIcon />, section: "Assessment" },
  { label: "Student Groups", href: "/faculty/groups", icon: <GroupsOutlinedIcon />, section: "Assessment" },
  { label: "MCQ Tests", href: "/faculty/mcq", icon: <QuizOutlinedIcon />, section: "Assessment" },
  { label: "Exams", href: "/faculty/exams", icon: <AssignmentOutlinedIcon />, section: "Assessment" },
  { label: "Plagiarism", href: "/faculty/plagiarism", icon: <PolicyOutlinedIcon />, section: "Assessment" },
  { label: "Judge Health", href: "/faculty/judge-health", icon: <MonitorHeartOutlinedIcon />, section: "Platform" },
];

// Department-wide view. Faculty are scoped to their own classes, so a
// department dashboard would show them a near-empty page; HOD and admin are the
// roles whose scope actually spans the department.
const DEPARTMENT_NAV: NavItem[] = [
  { label: "Department", href: "/faculty/department", icon: <BusinessOutlinedIcon />, section: "Overview" },
];

// Admin-only navigation. Both call routes gated on authorize('admin'), so
// showing them to faculty or an HOD only produces a 403 page.
const ADMIN_NAV: NavItem[] = [
  { label: "Permissions", href: "/faculty/permissions", icon: <AdminPanelSettingsOutlinedIcon />, section: "Administration" },
  { label: "Audit Log", href: "/faculty/audit-logs", icon: <ReceiptLongOutlinedIcon />, section: "Administration" },
];

export default function FacultyLayout({ children }: { children: React.ReactNode }) {
  const [navItems, setNavItems] = React.useState<NavItem[]>(BASE_NAV);
  const pathname = usePathname();
  const router = useRouter();

  React.useEffect(() => {
    const role = getRole();
    // Department sits right after Analytics in the Overview group.
    const withDept = role === "hod" || role === "admin"
      ? [...BASE_NAV.slice(0, 2), ...DEPARTMENT_NAV, ...BASE_NAV.slice(2)]
      : BASE_NAV;
    setNavItems(role === "admin" ? [...withDept, ...ADMIN_NAV] : withDept);
  }, []);

  // Typing an admin-only URL as faculty/HOD would render a page of 403 errors; send them home instead.
  React.useEffect(() => {
    const role = getRole();
    const adminOnly = ADMIN_NAV.some((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
    if (adminOnly && role !== "admin") router.replace("/faculty/dashboard");
    // Same guard for the department view: faculty are class-scoped everywhere else.
    const deptOnly = DEPARTMENT_NAV.some((n) => pathname === n.href || pathname.startsWith(`${n.href}/`));
    if (deptOnly && role !== "hod" && role !== "admin") router.replace("/faculty/dashboard");
  }, [pathname, router]);

  return (
    <AuthGuard roles={["faculty", "admin", "hod"]}>
      <AppShell navItems={navItems} profileHref="/faculty/profile">
        {children}
      </AppShell>
    </AuthGuard>
  );
}
