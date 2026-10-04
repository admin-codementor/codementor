"use client";

import * as React from "react";
import NextLink from "next/link";
import { useQueryClient } from "@tanstack/react-query";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import CardContent from "@mui/material/CardContent";
import Chip from "@mui/material/Chip";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useMistakesQuery, type MistakeEntry } from "@/lib/queries/student";
import { useToast } from "@/components/feedback/ToastProvider";
import { PageHeader } from "@/components/ui/PageHeader";
import { DataState } from "@/components/ui/DataState";
import { ListSkeleton } from "@/components/ui/Skeletons";
import { DifficultyChip } from "@/components/ui/DifficultyChip";
import { SearchField } from "@/components/ui/SearchField";
import { ArrowForwardIcon, EditOutlinedIcon, HistoryOutlinedIcon, SaveOutlinedIcon } from "@/components/ui/icons";
import { layout, radius } from "@/theme/tokens";

/**
 * Problems attempted but not yet solved.
 *
 * This is the useful half of the failed attempts the dashboard stopped listing:
 * somewhere to come back to, rather than a feed of things that went wrong. A
 * problem leaves this page by itself once it is solved.
 */

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const days = Math.floor(diff / 86_400_000);
  if (days < 1) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function NoteEditor({ entry, onSaved }: { entry: MistakeEntry; onSaved: () => void }) {
  const toast = useToast();
  const [open, setOpen] = React.useState(false);
  const [value, setValue] = React.useState(entry.note ?? "");
  const [saving, setSaving] = React.useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await api.put(`/api/student/mistakes/${entry.problem_id}/note`, { note: value });
      toast(value.trim() ? "Note saved" : "Note removed");
      setOpen(false);
      onSaved();
    } catch (err) {
      toast(apiErrorMessage(err), { severity: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (!open) {
    return entry.note ? (
      <Box
        sx={{
          mt: 1.5,
          p: 1.25,
          borderRadius: radius.sm,
          bgcolor: "surfaceContainerHigh",
          display: "flex",
          alignItems: "flex-start",
          gap: 1,
        }}
      >
        <Typography variant="body2" sx={{ flex: 1, whiteSpace: "pre-wrap" }}>
          {entry.note}
        </Typography>
        <Button size="small" onClick={() => setOpen(true)} startIcon={<EditOutlinedIcon fontSize="small" />}>
          Edit
        </Button>
      </Box>
    ) : (
      <Button size="small" sx={{ mt: 1 }} onClick={() => setOpen(true)} startIcon={<EditOutlinedIcon fontSize="small" />}>
        Add a note
      </Button>
    );
  }

  return (
    <Stack direction="row" spacing={1} alignItems="flex-start" sx={{ mt: 1.5 }}>
      <TextField
        size="small"
        fullWidth
        multiline
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="What tripped you up? e.g. forgot the empty-array case"
        slotProps={{ htmlInput: { maxLength: 500 } }}
      />
      <Button
        variant="contained"
        size="small"
        onClick={save}
        disabled={saving}
        startIcon={<SaveOutlinedIcon fontSize="small" />}
      >
        Save
      </Button>
      <Button size="small" onClick={() => { setValue(entry.note ?? ""); setOpen(false); }} disabled={saving}>
        Cancel
      </Button>
    </Stack>
  );
}

export default function MistakesPage() {
  const { data, isLoading, isError, error, isFetching, refetch } = useMistakesQuery();
  const queryClient = useQueryClient();
  const [search, setSearch] = React.useState("");

  const entries = data ?? [];
  const visible = entries.filter((e) =>
    e.problem_title.toLowerCase().includes(search.trim().toLowerCase()),
  );

  return (
    <Box>
      <PageHeader
        title="Mistakes notebook"
        subtitle="Problems you've attempted but haven't solved yet. They disappear from here once you solve them."
        actions={
          entries.length > 0 ? (
            <SearchField value={search} onChange={setSearch} placeholder="Search problems" />
          ) : undefined
        }
      />

      <DataState
        loading={isLoading}
        fetching={isFetching && !isLoading}
        error={isError ? error : undefined}
        empty={entries.length === 0}
        onRetry={() => refetch()}
        skeleton={<ListSkeleton rows={4} />}
        emptyVariant="firstUse"
        emptyTitle="Nothing to revisit"
        emptyDescription="Problems you attempt but don't solve will collect here, so you can come back to them."
        emptyAction={
          <Button component={NextLink} href="/app/problems" variant="contained">
            Find a problem
          </Button>
        }
      >
        {visible.length === 0 ? (
          <Typography variant="body2" color="text.secondary" sx={{ py: 4, textAlign: "center" }}>
            No problems match “{search}”.
          </Typography>
        ) : (
          <Stack spacing={2}>
            {visible.map((entry) => (
              <Card key={entry.problem_id} variant="outlined" sx={{ borderColor: "outlineVariant" }}>
                <CardContent sx={{ p: layout.cardPadding, "&:last-child": { pb: layout.cardPadding } }}>
                  <Stack
                    direction={{ xs: "column", sm: "row" }}
                    spacing={1.5}
                    alignItems={{ xs: "flex-start", sm: "center" }}
                    justifyContent="space-between"
                  >
                    <Box sx={{ minWidth: 0 }}>
                      <Stack direction="row" spacing={1} alignItems="center" flexWrap="wrap" useFlexGap>
                        <Typography variant="subtitle1" fontWeight={600}>
                          {entry.problem_title}
                        </Typography>
                        {entry.difficulty && <DifficultyChip difficulty={entry.difficulty} />}
                      </Stack>
                      <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 0.5 }} flexWrap="wrap" useFlexGap>
                        <Typography variant="body2" color="text.secondary">
                          {entry.last_verdict_summary}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          · {entry.attempts} attempt{entry.attempts === 1 ? "" : "s"} · last {timeAgo(entry.last_attempt_at)}
                        </Typography>
                      </Stack>
                    </Box>
                    <Button
                      component={NextLink}
                      href={`/app/problems/${entry.problem_id}`}
                      variant="contained"
                      size="small"
                      endIcon={<ArrowForwardIcon fontSize="small" />}
                      sx={{ flexShrink: 0 }}
                    >
                      Try again
                    </Button>
                  </Stack>

                  {entry.tags.length > 0 && (
                    <Stack direction="row" spacing={0.75} sx={{ mt: 1 }} flexWrap="wrap" useFlexGap>
                      {entry.tags.slice(0, 4).map((tag) => (
                        <Chip key={tag} label={tag} size="small" variant="outlined" />
                      ))}
                    </Stack>
                  )}

                  <NoteEditor
                    entry={entry}
                    onSaved={() => queryClient.invalidateQueries({ queryKey: ["student", "mistakes"] })}
                  />
                </CardContent>
              </Card>
            ))}
          </Stack>
        )}
      </DataState>

      {entries.length > 0 && (
        <Stack direction="row" spacing={1} alignItems="center" justifyContent="center" sx={{ mt: 3 }}>
          <HistoryOutlinedIcon fontSize="small" color="disabled" />
          <Typography variant="caption" color="text.secondary">
            Only you can see this page and your notes.
          </Typography>
        </Stack>
      )}
    </Box>
  );
}
