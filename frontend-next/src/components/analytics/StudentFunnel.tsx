"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Stack from "@mui/material/Stack";
import Typography from "@mui/material/Typography";
import { EmptyState } from "@/components/ui/States";
import { interactiveSurfaceSx } from "@/components/ui/interactive";
import { shape, radius, typeScale } from "@/theme/tokens";
import { ExportButton, toCsv } from "./ExportButton";
import { ThresholdsDialog, QUIET_DAYS } from "./ThresholdsDialog";

export interface FunnelStudent { id: string; name: string; roll_no: string | null; section: string | null; reasons: string[] }
export interface FunnelBucket { key: string; label: string; count: number; students: FunnelStudent[] }

const FUNNEL_STYLE: Record<string, { bg: string; fg: string; help: string }> = {
  not_started: { bg: "errorContainer", fg: "onErrorContainer", help: "Has never submitted anything" },
  practising: { bg: "successContainer", fg: "onSuccessContainer", help: "Submitted recently and solving problems" },
  stuck: { bg: "warningContainer", fg: "onWarningContainer", help: "Submitting, but nothing accepted yet" },
  gone_quiet: { bg: "secondaryContainer", fg: "onSecondaryContainer", help: `Was active before, silent for ${QUIET_DAYS}+ days` },
};

/**
 * Where every student stands: four counts that add up to the whole cohort, each
 * opening the list of who is in it. One implementation for the department
 * dashboard and the class-level analytics, so the two can never disagree.
 */
export function StudentFunnel({ funnel, total, title = "Where every student stands" }: {
  funnel: FunnelBucket[];
  total: number;
  title?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<FunnelBucket | null>(null);

  return (
    <Box>
      <Stack direction="row" alignItems="center" spacing={0.5} sx={{ mb: 1.5 }}>
        <Typography variant="subtitle1" fontWeight={600}>{title}</Typography>
        <ThresholdsDialog kind="flag" />
      </Stack>
      <Box sx={{ display: "grid", gap: 2, gridTemplateColumns: { xs: "1fr 1fr", md: "repeat(4, 1fr)" }, mb: 1 }}>
        {funnel.map((f) => {
          const st = FUNNEL_STYLE[f.key];
          return (
            <Card
              key={f.key}
              variant="outlined"
              component="button"
              type="button"
              onClick={() => setOpen(f)}
              aria-label={`${f.label}: ${f.count} students`}
              sx={{
                all: "unset", boxSizing: "border-box", cursor: "pointer", p: 2.5,
                borderRadius: `${shape.large}px`, bgcolor: st.bg, color: st.fg,
                ...interactiveSurfaceSx,
                "&:focus-visible": { outline: "2px solid var(--mui-palette-primary-main)", outlineOffset: 2 },
              }}
            >
              <Typography variant="overline" sx={{ opacity: 0.85 }}>{f.label}</Typography>
              <Typography variant="h4" fontWeight={700} sx={{ lineHeight: 1.1 }}>{f.count}</Typography>
              <Typography variant="caption" sx={{ opacity: 0.85, display: "block", mt: 0.5 }}>{st.help}</Typography>
            </Card>
          );
        })}
      </Box>
      <Typography variant="caption" color="text.secondary" sx={{ display: "block", mb: 3 }}>
        {`These four add up to all ${total} students. Click any one to see who is in it. "Gone quiet" means no submission for ${QUIET_DAYS} days.`}
      </Typography>

      <Dialog open={!!open} onClose={() => setOpen(null)} fullWidth maxWidth="sm" aria-labelledby="funnel-title">
        <DialogTitle id="funnel-title">
          {open?.label} · {open?.count} student{open?.count === 1 ? "" : "s"}
        </DialogTitle>
        <DialogContent dividers>
          {!open?.students.length ? (
            <EmptyState title="Nobody in this group" description="Nothing to act on here right now." />
          ) : (
            <List disablePadding>
              {open.students.map((s) => (
                <ListItemButton key={s.id} onClick={() => router.push(`/faculty/students/${s.id}`)} sx={{ borderRadius: radius.sm }}>
                  <ListItemText
                    primary={
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <span>{s.name}</span>
                        {s.roll_no && <Chip size="small" label={s.roll_no} sx={{ height: 18, fontSize: typeScale.labelSmall.fontSize }} />}
                        {s.section && <Chip size="small" label={`Sec ${s.section}`} sx={{ height: 18, fontSize: typeScale.labelSmall.fontSize }} />}
                      </Stack>
                    }
                    secondary={s.reasons.length ? s.reasons.join(" · ") : "No concerns recorded"}
                  />
                </ListItemButton>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions>
          <ExportButton
            filename={`${open?.key ?? "group"}-students.csv`}
            csv={() => toCsv((open?.students ?? []).map((s) => ({
              name: s.name, roll_no: s.roll_no ?? "", section: s.section ?? "", reasons: s.reasons.join("; "),
            })))}
            disabled={!open?.students.length}
          />
          <Button onClick={() => setOpen(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
