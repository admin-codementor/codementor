"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import CircularProgress from "@mui/material/CircularProgress";
import { getUser, getRole, homeForRole } from "@/lib/auth";
import type { Role } from "@/lib/types";

/**
 * Client-side route protection equivalent to the old RequireAuth/RequireFaculty/
 * RequireAdmin wrappers. Tokens live in localStorage (not cookies), so guarding
 * happens on the client after mount. Renders a spinner until the check resolves
 * to avoid flashing protected content.
 */
export function AuthGuard({
  children,
  roles,
}: {
  children: React.ReactNode;
  /** If set, the user's role must be included; otherwise any logged-in user passes. */
  roles?: Role[];
}) {
  const router = useRouter();
  const [status, setStatus] = React.useState<"checking" | "ok">("checking");

  React.useEffect(() => {
    const user = getUser();
    if (!user) {
      router.replace("/login");
      return;
    }
    if (user.must_change_password) {
      router.replace("/change-password");
      return;
    }
    if (roles && !roles.includes(user.role)) {
      router.replace(homeForRole(getRole()));
      return;
    }
    setStatus("ok");
  }, [router, roles]);

  if (status === "checking") {
    return (
      <Box
        sx={{ minHeight: "100dvh", display: "grid", placeItems: "center" }}
        role="status"
        aria-live="polite"
        aria-label="Checking your session"
      >
        <CircularProgress />
      </Box>
    );
  }

  return <>{children}</>;
}
