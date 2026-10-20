/**
 * Judge0 language id → human-readable name. The backend often stores the raw
 * Judge0 language id (e.g. "71") on submissions; this maps the common ones so
 * the UI shows "Python" instead of "71". Unknown ids fall through unchanged.
 */
export const JUDGE0_LANGUAGES: Record<string, string> = {
  "50": "C",
  "54": "C++",
  "51": "C#",
  "60": "Go",
  "62": "Java",
  "63": "JavaScript",
  "68": "PHP",
  "70": "Python 2",
  "71": "Python",
  "92": "Python",
  "100": "Python",
  "72": "Ruby",
  "73": "Rust",
  "74": "TypeScript",
  "78": "Kotlin",
  "80": "R",
  "83": "Swift",
};

/** Returns the language name for a Judge0 id (numeric or string); passes through
 *  values that are already names, and "—" for null/undefined. */
export function languageName(lang: string | number | null | undefined): string {
  if (lang == null || lang === "") return "—";
  const key = String(lang);
  return JUDGE0_LANGUAGES[key] ?? key;
}
