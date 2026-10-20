// Builds the program Judge0 actually runs.
//
// Most problems are plain programs: the student's code is the whole source. A function-style problem (the
// student writes `def tiles_needed(l, w, s=1)` and nothing else) carries a `harness` per language: a small
// driver appended AFTER the student's code, so error line numbers stay the student's own. The student's code
// is what is stored and shown back; only the copy sent to Judge0 gets the harness.

function buildSource(studentCode, languageId, harness) {
  const driver = harness && typeof harness === 'object' ? harness[String(languageId)] : null;
  if (!driver) return studentCode;
  return `${String(studentCode).replace(/\s+$/, '')}\n\n${driver}\n`;
}

// Python driver for function-style problems. Every non-blank stdin line is the argument list of one call;
// the output is repr(result), or the exception's class name when the call raises (those problems test
// that a function rejects bad input). The function name is fixed per problem at import time.
function pythonFunctionHarness(functionName) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(functionName)) throw new Error(`Not a valid function name: ${functionName}`);
  return [
    '# ---- CodeMentor test driver (not part of your solution) ----',
    'import sys as __cm_sys',
    'for __cm_line in __cm_sys.stdin.read().split("\\n"):',
    '    if __cm_line.strip() == "":',
    '        continue',
    '    try:',
    `        print(repr(eval("${functionName}(" + __cm_line + ")")))`,
    '    except Exception as __cm_err:',
    '        print(type(__cm_err).__name__)',
  ].join('\n');
}

module.exports = { buildSource, pythonFunctionHarness };
