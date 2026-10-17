"use client";

import * as React from "react";
import Tab from "@mui/material/Tab";
import Tabs from "@mui/material/Tabs";
import Stack from "@mui/material/Stack";
import { PageHeader } from "@/components/ui/PageHeader";
import { MessagesPanel } from "@/components/messages/MessagesPanel";
import { ReportedMessages } from "@/components/messages/ReportedMessages";
import { getRole } from "@/lib/auth";

export default function FacultyMessagesPage() {
  // Reviewing reports is for the head of department and admins; the server enforces it too.
  // The role lives in localStorage: null while rendering on the server, so the first paint matches.
  const role = React.useSyncExternalStore(() => () => {}, getRole, () => null);
  const canReview = role === "hod" || role === "admin";
  const [tab, setTab] = React.useState<"inbox" | "reported">("inbox");

  return (
    <Stack>
      <PageHeader title="Messages" subtitle="Private conversations with staff and with students you teach or mentor." />
      {canReview && (
        <Tabs value={tab} onChange={(_, v: "inbox" | "reported") => setTab(v)} sx={{ borderBottom: "1px solid", borderColor: "outlineVariant", mb: 3 }}>
          <Tab value="inbox" label="Inbox" />
          <Tab value="reported" label="Reported" />
        </Tabs>
      )}
      {tab === "reported" && canReview ? <ReportedMessages /> : <MessagesPanel canStart />}
    </Stack>
  );
}
