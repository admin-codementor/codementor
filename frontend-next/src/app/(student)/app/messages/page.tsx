"use client";

import * as React from "react";
import Stack from "@mui/material/Stack";
import { PageHeader } from "@/components/ui/PageHeader";
import { MessagesPanel } from "@/components/messages/MessagesPanel";

export default function StudentMessagesPage() {
  return (
    <Stack>
      <PageHeader title="Messages" subtitle="Messages from your teachers and mentors. You can reply, block or report." />
      <MessagesPanel canStart={false} />
    </Stack>
  );
}
