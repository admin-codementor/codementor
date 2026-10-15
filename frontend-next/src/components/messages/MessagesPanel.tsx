"use client";

import * as React from "react";
import Alert from "@mui/material/Alert";
import Box from "@mui/material/Box";
import Button from "@mui/material/Button";
import Card from "@mui/material/Card";
import Chip from "@mui/material/Chip";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogTitle from "@mui/material/DialogTitle";
import IconButton from "@mui/material/IconButton";
import List from "@mui/material/List";
import ListItemButton from "@mui/material/ListItemButton";
import ListItemText from "@mui/material/ListItemText";
import Skeleton from "@mui/material/Skeleton";
import Stack from "@mui/material/Stack";
import TextField from "@mui/material/TextField";
import Typography from "@mui/material/Typography";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import api from "@/lib/api";
import { apiErrorMessage } from "@/lib/apiError";
import { useToast } from "@/components/feedback/ToastProvider";
import { useConfirm } from "@/components/feedback/ConfirmProvider";
import { EmptyState } from "@/components/ui/States";
import { SearchField } from "@/components/ui/SearchField";
import { AddIcon, ArrowBackIcon, MailOutlineIcon, SendIcon } from "@/components/ui/icons";
import { radius, typeScale } from "@/theme/tokens";

const MAX_BODY = 1000;
const MAX_REASON = 300;

interface Thread {
  id: string; with: { id: string; name: string; role: string | null }; status: "pending" | "active" | "declined";
  awaiting_my_answer: boolean; i_started: boolean; blocked_by_me: boolean; reported: boolean;
  last_message_at: string | null; last_preview: string; unread: boolean;
}
interface Message { id: string; mine: boolean; body: string; sent_at: string }
interface Contact { id: string; name: string; role: string; detail: string }

const ROLE_LABEL: Record<string, string> = { student: "Student", faculty: "Faculty", hod: "HOD", admin: "Admin" };
const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString(undefined, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }) : "");

export const PRIVACY_NOTE = "Messages are private between the two of you. If either person reports a conversation, the head of the department or an administrator can read it.";

function NewMessageDialog({ onClose, onStarted }: { onClose: () => void; onStarted: (id: string) => void }) {
  const qc = useQueryClient();
  const [q, setQ] = React.useState("");
  const term = React.useDeferredValue(q.trim());
  const [to, setTo] = React.useState<Contact | null>(null);
  const [body, setBody] = React.useState("");

  const contacts = useQuery<Contact[]>({
    queryKey: ["messages", "contacts", term],
    queryFn: async () => (await api.get("/api/messages/contacts", { params: { q: term } })).data.data,
    enabled: term.length >= 2,
    staleTime: 30_000,
  });
  const send = useMutation({
    mutationFn: async () => (await api.post("/api/messages/threads", { to: to?.id, body })).data.data as { id: string },
    onSuccess: (r) => { qc.invalidateQueries({ queryKey: ["messages"] }); onStarted(r.id); },
  });

  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="sm" aria-labelledby="new-msg-title">
      <DialogTitle id="new-msg-title">New message</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="info" variant="outlined">
            You can message staff in your department and students you teach, mentor or head. A student sees who is writing and can accept, decline, block or report. Until they accept, you can send one opening message.
          </Alert>
          {to ? (
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="body2">To:</Typography>
              <Chip label={`${to.name} · ${ROLE_LABEL[to.role] ?? to.role}`} onDelete={() => setTo(null)} />
            </Stack>
          ) : (
            <>
              <SearchField value={q} onChange={setQ} placeholder="Search by name or roll number" label="Find a person" fullWidth />
              {term.length < 2 ? (
                <Typography variant="caption" color="text.secondary">Type at least two letters.</Typography>
              ) : contacts.isLoading ? (
                <Skeleton variant="rounded" height={80} />
              ) : (contacts.data ?? []).length === 0 ? (
                <Typography variant="body2" color="text.secondary">No one matches. You can only message people listed for your role.</Typography>
              ) : (
                <List dense disablePadding sx={{ border: "1px solid", borderColor: "outlineVariant", borderRadius: radius.md, maxHeight: 220, overflowY: "auto" }}>
                  {(contacts.data ?? []).map((c) => (
                    <ListItemButton key={c.id} onClick={() => setTo(c)}>
                      <ListItemText primary={c.name} secondary={[ROLE_LABEL[c.role] ?? c.role, c.detail].filter(Boolean).join(" · ")} />
                    </ListItemButton>
                  ))}
                </List>
              )}
            </>
          )}
          <TextField
            label="Message" multiline minRows={3} maxRows={8} value={body} onChange={(e) => setBody(e.target.value)}
            helperText={`${body.length}/${MAX_BODY}`} slotProps={{ htmlInput: { maxLength: MAX_BODY } }} disabled={!to}
          />
          {send.isError && <Alert severity="error">{apiErrorMessage(send.error, "Could not send.")}</Alert>}
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" endIcon={<SendIcon />} disabled={!to || !body.trim() || send.isPending} onClick={() => send.mutate()}>{send.isPending ? "Sending…" : "Send"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function ReportDialog({ onClose, onReport, pending }: { onClose: () => void; onReport: (reason: string) => void; pending: boolean }) {
  const [reason, setReason] = React.useState("");
  return (
    <Dialog open onClose={onClose} fullWidth maxWidth="xs" aria-labelledby="report-title">
      <DialogTitle id="report-title">Report this conversation</DialogTitle>
      <DialogContent dividers>
        <Stack spacing={2}>
          <Alert severity="warning" variant="outlined">
            Reporting lets the head of your department or an administrator read this conversation. It also blocks further messages to you.
          </Alert>
          <TextField
            label="What is wrong? (optional)" multiline minRows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            helperText={`${reason.length}/${MAX_REASON}`} slotProps={{ htmlInput: { maxLength: MAX_REASON } }}
          />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" color="error" disabled={pending} onClick={() => onReport(reason)}>{pending ? "Reporting…" : "Report"}</Button>
      </DialogActions>
    </Dialog>
  );
}

function Conversation({ id, onBack }: { id: string; onBack: () => void }) {
  const qc = useQueryClient();
  const showToast = useToast();
  const confirm = useConfirm();
  const [body, setBody] = React.useState("");
  const [reporting, setReporting] = React.useState(false);
  const endRef = React.useRef<HTMLDivElement | null>(null);

  const query = useQuery<{ thread: Thread; messages: Message[] }>({
    queryKey: ["messages", "thread", id],
    queryFn: async () => {
      const data = (await api.get(`/api/messages/threads/${id}`)).data.data;
      // Opening a conversation marks it read on the server; mirror that in the list without a refetch.
      qc.setQueryData<Thread[]>(["messages", "threads"], (cur) => cur?.map((t) => (t.id === id ? { ...t, unread: false } : t)));
      return data;
    },
    refetchInterval: 10_000,
  });
  const messageCount = query.data?.messages.length ?? 0;
  React.useEffect(() => { endRef.current?.scrollIntoView({ block: "end" }); }, [messageCount, id]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["messages"] });
  const send = useMutation({
    mutationFn: async () => api.post(`/api/messages/threads/${id}/messages`, { body }),
    onSuccess: () => { setBody(""); refresh(); },
    onError: (e) => showToast(apiErrorMessage(e, "Could not send."), { severity: "error" }),
  });
  const act = useMutation({
    mutationFn: async (v: { action: string; reason?: string }) => api.patch(`/api/messages/threads/${id}`, v),
    onSuccess: (_r, v) => { setReporting(false); refresh(); if (v.action === "report") showToast("Reported. Someone will review this conversation.", { severity: "success" }); },
    onError: (e) => showToast(apiErrorMessage(e, "Could not update the conversation."), { severity: "error" }),
  });

  if (query.isError) return <Alert severity="error" sx={{ m: 2 }}>{apiErrorMessage(query.error, "Could not open the conversation.")}</Alert>;
  if (query.isLoading || !query.data) return <Skeleton variant="rounded" height={320} sx={{ m: 2 }} />;
  const { thread, messages } = query.data;

  const declined = thread.status === "declined";
  const waiting = thread.status === "pending" && thread.i_started && thread.with.role === "student";
  const canWrite = !declined && !thread.blocked_by_me && !waiting;
  const submit = () => { if (body.trim() && canWrite && !send.isPending) send.mutate(); };

  return (
    <Stack sx={{ height: "100%", minHeight: 0 }}>
      <Stack direction="row" alignItems="center" spacing={1} sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "outlineVariant" }}>
        <IconButton aria-label="Back to conversations" onClick={onBack} sx={{ display: { md: "none" } }}><ArrowBackIcon /></IconButton>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle1" fontWeight={600} noWrap>{thread.with.name}</Typography>
          <Typography variant="caption" color="text.secondary">{ROLE_LABEL[thread.with.role ?? ""] ?? ""}</Typography>
        </Box>
        {thread.blocked_by_me
          ? <Button size="small" onClick={() => act.mutate({ action: "unblock" })}>Unblock</Button>
          : <Button size="small" color="inherit" onClick={async () => { if (await confirm({ title: `Block ${thread.with.name}?`, description: "They will not be able to message you until you unblock.", confirmLabel: "Block", destructive: true })) act.mutate({ action: "block" }); }}>Block</Button>}
        {!thread.reported && <Button size="small" color="error" onClick={() => setReporting(true)}>Report</Button>}
      </Stack>

      {thread.awaiting_my_answer && (
        <Alert severity="info" icon={false} sx={{ borderRadius: 0 }} action={
          <Stack direction="row" spacing={1}>
            <Button size="small" variant="contained" onClick={() => act.mutate({ action: "accept" })} disabled={act.isPending}>Accept</Button>
            <Button size="small" onClick={() => act.mutate({ action: "decline" })} disabled={act.isPending}>Decline</Button>
          </Stack>
        }>
          <strong>{thread.with.name}</strong> wants to message you. Accepting lets them keep writing; replying also accepts. You can block or report at any time.
        </Alert>
      )}
      {declined && <Alert severity="warning" sx={{ borderRadius: 0 }} action={thread.with.role === "student" ? undefined : <Button size="small" onClick={() => act.mutate({ action: "accept" })}>Accept after all</Button>}>This conversation was declined, so nobody can write in it.</Alert>}
      {thread.reported && <Alert severity="warning" sx={{ borderRadius: 0 }}>This conversation has been reported and is waiting for review.</Alert>}
      {waiting && <Alert severity="info" sx={{ borderRadius: 0 }}>Waiting for the student to accept. You can send more once they reply or accept.</Alert>}

      <Box sx={{ flex: 1, minHeight: 0, overflowY: "auto", p: 2, bgcolor: "surfaceContainerLow" }} aria-live="polite">
        <Stack spacing={1}>
          {messages.map((m) => (
            <Box key={m.id} sx={{ alignSelf: m.mine ? "flex-end" : "flex-start", maxWidth: "80%" }}>
              <Box sx={{ px: 1.5, py: 1, borderRadius: radius.md, bgcolor: m.mine ? "primaryContainer" : "surfaceContainerHighest", color: m.mine ? "onPrimaryContainer" : "text.primary", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
                <Typography variant="body2" component="span">{m.body}</Typography>
              </Box>
              <Typography variant="caption" color="text.secondary" sx={{ display: "block", textAlign: m.mine ? "right" : "left", fontSize: typeScale.labelSmall.fontSize }}>{when(m.sent_at)}</Typography>
            </Box>
          ))}
          <div ref={endRef} />
        </Stack>
      </Box>

      <Stack direction="row" spacing={1} alignItems="flex-end" sx={{ p: 1.5, borderTop: "1px solid", borderColor: "outlineVariant" }}>
        <TextField
          fullWidth size="small" multiline maxRows={4} value={body} onChange={(e) => setBody(e.target.value)} disabled={!canWrite}
          placeholder={canWrite ? "Write a message (Ctrl+Enter to send)" : "You cannot write in this conversation right now"}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); submit(); } }}
          slotProps={{ htmlInput: { maxLength: MAX_BODY, "aria-label": "Message" } }}
        />
        <Button variant="contained" onClick={submit} disabled={!canWrite || !body.trim() || send.isPending} endIcon={<SendIcon />}>Send</Button>
      </Stack>
      {reporting && <ReportDialog onClose={() => setReporting(false)} pending={act.isPending} onReport={(reason) => act.mutate({ action: "report", reason })} />}
    </Stack>
  );
}

/** Two-pane inbox: conversations on the left, the open one on the right (one at a time on a phone). */
export function MessagesPanel({ canStart }: { canStart: boolean }) {
  const [selected, setSelected] = React.useState<string | null>(null);
  const [composing, setComposing] = React.useState(false);

  const threads = useQuery<Thread[]>({
    queryKey: ["messages", "threads"],
    queryFn: async () => (await api.get("/api/messages/threads")).data.data,
    refetchInterval: 20_000,
  });

  return (
    <Box>
      <Alert severity="info" variant="outlined" sx={{ mb: 2 }}>{PRIVACY_NOTE} Messages are plain text, up to {MAX_BODY} characters, with no attachments.</Alert>
      <Card variant="outlined" sx={{ borderColor: "outlineVariant", display: "flex", height: { xs: "70vh", md: "calc(100vh - 320px)" }, minHeight: 420, overflow: "hidden" }}>
        <Box sx={{ width: { xs: "100%", md: 340 }, flexShrink: 0, borderRight: { md: "1px solid" }, borderColor: "outlineVariant", display: { xs: selected ? "none" : "flex", md: "flex" }, flexDirection: "column", minHeight: 0 }}>
          {canStart && (
            <Box sx={{ p: 1.5, borderBottom: "1px solid", borderColor: "outlineVariant" }}>
              <Button fullWidth variant="contained" startIcon={<AddIcon />} onClick={() => setComposing(true)}>New message</Button>
            </Box>
          )}
          <Box sx={{ flex: 1, overflowY: "auto" }}>
            {threads.isError ? (
              <Alert severity="error" sx={{ m: 1.5 }} action={<Button color="inherit" size="small" onClick={() => threads.refetch()}>Retry</Button>}>{apiErrorMessage(threads.error, "Could not load messages.")}</Alert>
            ) : threads.isLoading ? (
              <Stack spacing={1} sx={{ p: 1.5 }}><Skeleton variant="rounded" height={56} /><Skeleton variant="rounded" height={56} /></Stack>
            ) : (threads.data ?? []).length === 0 ? (
              <EmptyState compact icon={<MailOutlineIcon />} title="No messages yet" description={canStart ? "Start a conversation with a teacher, mentor or student." : "When a teacher writes to you, it appears here."} />
            ) : (
              <List disablePadding aria-label="Conversations">
                {(threads.data ?? []).map((t) => (
                  <ListItemButton key={t.id} selected={t.id === selected} onClick={() => setSelected(t.id)} sx={{ alignItems: "flex-start", borderBottom: "1px solid", borderColor: "outlineVariant" }}>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2" fontWeight={t.unread ? 700 : 500} noWrap sx={{ flex: 1 }}>{t.with.name}</Typography>
                          {t.awaiting_my_answer && <Chip size="small" label="New" color="primary" sx={{ height: 18, fontSize: typeScale.labelSmall.fontSize }} />}
                          {t.unread && !t.awaiting_my_answer && <Box aria-label="Unread" sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: "primary.main" }} />}
                        </Stack>
                      }
                      secondary={<Typography variant="caption" color="text.secondary" noWrap component="span" sx={{ display: "block" }}>{t.last_preview || "—"}</Typography>}
                    />
                  </ListItemButton>
                ))}
              </List>
            )}
          </Box>
        </Box>
        <Box sx={{ flex: 1, minWidth: 0, display: { xs: selected ? "block" : "none", md: "block" }, minHeight: 0 }}>
          {selected ? <Conversation key={selected} id={selected} onBack={() => setSelected(null)} /> : (
            <EmptyState icon={<MailOutlineIcon />} title="Select a conversation" description="Your messages open here." />
          )}
        </Box>
      </Card>
      {composing && <NewMessageDialog onClose={() => setComposing(false)} onStarted={(id) => { setComposing(false); setSelected(id); }} />}
    </Box>
  );
}
