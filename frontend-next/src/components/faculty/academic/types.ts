// Shapes returned by /api/academic/* (backend/src/services/academicService.js).
export interface Term { id: string; label: string; academicYear: string; semester?: string; startDate: string; endDate: string; status: "planned" | "active" | "closed" }
export interface Staff { id: string; name: string | null; role: string; department: string | null }
export interface SubMentor { mentorId: string; from: number; to: number; name?: string | null }
export interface AssignmentRow { id: string; facultyId: string; facultyName: string | null; subject: string; from: string; to: string | null; active: boolean }
export interface ClassRow {
  id: string; label: string; kind: "section" | "elective"; department: string; year: number | null; section: string | null; students: number;
  classTeacher: { id: string; name: string | null } | null; subMentors: SubMentor[]; assignments: AssignmentRow[];
}
export interface RosterStudent { id: string; name: string | null; rollNo: string | null; source: string | null; position: number; mentorId: string | null }
export interface Roster { class: { id: string; label: string; kind: string; department: string }; students: RosterStudent[] }
export interface Issue { code: string; message: string; classId?: string; studentId?: string }
export interface AccessRequest {
  id: string; facultyId: string; facultyName: string | null; classId: string; classLabel: string; department: string; reason: string;
  status: "pending" | "approved" | "declined"; expiresAt?: number | string | null; note?: string | null;
}
export interface GenerateResult { classes: number; classesCreated: number; enrolled: number; alreadyPlaced: number; skipped: { id: string; name: string | null; rollNo: string | null; reason: string }[] }
export interface PlacementResult { applied: number; failed: number; results: { row: number; rollNo: string | null; ok: boolean; reason?: string }[] }

export const staffLabel = (s: Staff) => `${s.name ?? "Unnamed"}${s.role === "hod" ? " (HOD)" : ""}`;

/** The suggested split: 24 students per mentor, the last mentor taking the rest (mirrors the server). */
export function suggestRanges(count: number, mentorIds: string[], size = 24): SubMentor[] {
  const ids = mentorIds.filter(Boolean);
  if (count < 1 || ids.length === 0) return [];
  const out: SubMentor[] = [];
  for (let i = 0; i < ids.length && i * size < count; i += 1) {
    const last = i === ids.length - 1 || (i + 1) * size >= count;
    out.push({ mentorId: ids[i], from: i * size + 1, to: last ? count : (i + 1) * size });
  }
  return out;
}

/** What is wrong with a set of ranges, in words (the server checks again; this only gives immediate feedback). */
export function rangeProblems(ranges: SubMentor[], count: number): string[] {
  const out: string[] = [];
  const sorted = [...ranges].filter((r) => r.mentorId && Number.isInteger(r.from) && Number.isInteger(r.to) && r.from >= 1 && r.to >= r.from).sort((a, b) => a.from - b.from);
  if (sorted.length !== ranges.length) out.push("Each range needs a mentor and whole numbers with from at least 1 and to at least from.");
  let next = 1;
  for (const r of sorted) {
    if (r.from > next) out.push(`Positions ${next === r.from - 1 ? next : `${next} to ${r.from - 1}`} have no sub-mentor.`);
    if (r.from < next) out.push(`Positions ${r.from} to ${Math.min(r.to, next - 1)} are covered twice.`);
    next = Math.max(next, r.to + 1);
  }
  if (count > 0 && next <= count) out.push(`Positions ${next === count ? next : `${next} to ${count}`} have no sub-mentor.`);
  if (next - 1 > count && count > 0) out.push(`A range goes up to ${next - 1} but the class has ${count} students.`);
  return out;
}

/** Roll, year and section per line from pasted or uploaded text. A header line is skipped. */
export function parsePlacements(text: string): { rollNo: string; year: string; section: string }[] {
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
    .map((l) => l.split(/[,\t;]/).map((c) => c.trim().replace(/^"|"$/g, "")))
    .filter((c) => !/^roll/i.test(c[0] ?? ""))
    .map((c) => ({ rollNo: c[0] ?? "", year: c[1] ?? "", section: c[2] ?? "" }));
}
