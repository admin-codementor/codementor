/**
 * Makes invisible differences visible when comparing outputs: a space becomes "·", a tab "→" and every line ends
 * with "↵". Trailing spaces and a missing final newline are exactly what exact-output grading cares about.
 */
export function visualizeWhitespace(text: string): string {
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  return lines
    .map((line, i) => {
      const shown = line.replace(/ /g, "·").replace(/\t/g, "→");
      const last = i === lines.length - 1;
      return last ? shown : `${shown}↵`;
    })
    .join("\n");
}
