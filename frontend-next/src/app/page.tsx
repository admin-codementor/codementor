"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { getUser, homeForRole } from "@/lib/auth";
import { Landing } from "@/components/landing/Landing";

/** Public landing page for logged-out visitors; signed-in users go straight to their role's home. */
export default function RootPage() {
  const router = useRouter();

  React.useEffect(() => {
    const user = getUser();
    if (user) router.replace(homeForRole(user.role));
  }, [router]);

  return <Landing />;
}
