// Output comparison modes for the judge.
//
// 'loose' (the default, unchanged): brackets, braces, quotes and commas become spaces and every run of
// whitespace, line breaks included, collapses to one space. That suits algorithm problems where the format
// is incidental, but it lets "1 2 3" on one line pass for three lines and a mis-centred banner pass for a
// centred one, so it cannot grade a course that teaches formatting.
//
// 'exact': the output must match line by line. Only things no student can see are forgiven: CRLF vs LF,
// trailing spaces or tabs on a line, and blank lines at the very end. Leading spaces, inner spacing, blank
// lines in the middle, case and punctuation all count. The whole output is compared, not a prefix.

const LOOSE_CAP = 4096;

function normalizeLoose(str) {
  if (!str) return '';
  const s = str.length > LOOSE_CAP ? str.slice(0, LOOSE_CAP) : str;
  return s.replace(/\[|\]|\{|\}|"|'|,/g, ' ').trim().split(/\s+/).join(' ');
}

function normalizeExact(str) {
  return String(str ?? '')
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\n+$/, '');
}

const isExact = (comparison) => comparison === 'exact';

function outputsMatch(actual, expected, comparison) {
  return isExact(comparison)
    ? normalizeExact(actual) === normalizeExact(expected)
    : normalizeLoose(actual) === normalizeLoose(expected);
}

module.exports = { normalizeLoose, normalizeExact, outputsMatch, isExact };
