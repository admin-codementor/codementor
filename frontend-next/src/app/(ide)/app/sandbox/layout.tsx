"use client";

import * as React from "react";
import { AuthGuard } from "@/components/auth/AuthGuard";

/** Full-screen sandbox layout — no sidebar, no AppShell padding (mirrors the problem IDE). */
export default function SandboxLayout({ children }: { children: React.ReactNode }) {
  return <AuthGuard>{children}</AuthGuard>;
}
