"use client";

import { RouteErrorPanel } from "@/components/feedback/RouteErrorPanel";

// A page that crashes shows this inside the menu and header, not instead of them.
export default function SectionError({ error, retry }: { error: unknown; retry: () => void }) {
  return <RouteErrorPanel error={error} retry={retry} home="/faculty/dashboard" />;
}
