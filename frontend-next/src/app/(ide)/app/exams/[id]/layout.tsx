"use client";

import * as React from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";

/** Full-screen exam-taking layout — no sidebar, no AppShell padding (mirrors the problem IDE). */
export default function ExamLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
