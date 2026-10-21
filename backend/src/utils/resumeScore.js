// Resume check: a plain, explainable score for a resume pasted as text. No AI and no cost, so the same resume always gets the
// same score and every point can be traced to a rule the student can act on. Pure: text in, result out.
//
// What it checks (100 points in all):
//   contact (10)       an email address and a phone number
//   sections (25)      education, skills, projects, experience or internships, achievements or certifications
//   summary (5)        a short profile / objective at the top
//   impact (20)        bullets that start with an action verb, and numbers that show results (%, counts, rupees)
//   length (10)        about one page: 250 to 700 words scores in full, thin or long scores less
//   keywords (25)      skills the chosen role looks for, found in the text
//   clean (5)          no obviously unprofessional habits (all capitals, very long lines, repeated words)
// It cannot judge truth or quality of writing. It is a checklist, and says so.

const ROLES = {
  software: {
    label: 'Software developer',
    keywords: ['python', 'java', 'c++', 'javascript', 'sql', 'git', 'github', 'data structures', 'algorithms', 'api', 'react', 'node', 'html', 'css', 'linux', 'oop', 'object oriented', 'database', 'testing', 'debugging'],
  },
  data: {
    label: 'Data and AI',
    keywords: ['python', 'sql', 'pandas', 'numpy', 'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'scikit', 'statistics', 'visualization', 'matplotlib', 'jupyter', 'nlp', 'data analysis', 'model', 'dataset', 'git'],
  },
  general: {
    label: 'General / any role',
    keywords: ['communication', 'teamwork', 'leadership', 'problem solving', 'project', 'internship', 'python', 'excel', 'presentation', 'time management', 'git'],
  },
};

const ACTION_VERBS = new Set(['built', 'developed', 'designed', 'implemented', 'created', 'led', 'managed', 'improved', 'reduced', 'increased', 'optimized', 'optimised', 'analyzed', 'analysed', 'deployed', 'automated', 'launched', 'organized', 'organised', 'trained', 'tested', 'integrated', 'migrated', 'wrote', 'achieved', 'won', 'secured', 'collaborated', 'engineered', 'delivered', 'coordinated', 'presented', 'mentored', 'solved', 'configured', 'maintained']);

const SECTION_PATTERNS = {
  education: /\b(education|academic|qualification)s?\b/i,
  skills: /\b(skills?|technical skills|technologies|tech stack)\b/i,
  projects: /\bprojects?\b/i,
  experience: /\b(experience|internships?|work history|employment)\b/i,
  achievements: /\b(achievements?|certifications?|certificates?|awards?|honou?rs?|accomplishments?)\b/i,
};
const SUMMARY_PATTERN = /\b(summary|objective|profile|about me|career objective)\b/i;

const POINTS = { contact: 10, sections: 25, summary: 5, impact: 20, length: 10, keywords: 25, clean: 5 };

const words = (text) => (text.match(/[A-Za-z0-9+#.'-]+/g) || []);
const lines = (text) => text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

function checkContact(text) {
  const email = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.test(text);
  const phone = /(\+?\d[\d\s-]{8,}\d)/.test(text);
  const got = (email ? 5 : 0) + (phone ? 5 : 0);
  const tips = [];
  if (!email) tips.push('Add a professional email address (name@domain, not a nickname).');
  if (!phone) tips.push('Add a phone number recruiters can call.');
  return { got, max: POINTS.contact, tips };
}

function checkSections(text) {
  const found = Object.fromEntries(Object.entries(SECTION_PATTERNS).map(([k, re]) => [k, re.test(text)]));
  const names = { education: 'Education', skills: 'Skills', projects: 'Projects', experience: 'Experience or internships', achievements: 'Achievements or certifications' };
  const each = POINTS.sections / Object.keys(SECTION_PATTERNS).length;
  const got = Object.values(found).filter(Boolean).length * each;
  const tips = Object.entries(found).filter(([, ok]) => !ok).map(([k]) => `Add a "${names[k]}" section with a clear heading.`);
  return { got, max: POINTS.sections, tips, found };
}

function checkSummary(text) {
  const head = lines(text).slice(0, 12).join('\n');
  const ok = SUMMARY_PATTERN.test(head);
  return { got: ok ? POINTS.summary : 0, max: POINTS.summary, tips: ok ? [] : ['Open with a two-line summary or career objective that names the role you want.'] };
}

function checkImpact(text) {
  const bullets = lines(text).filter((l) => /^[-•*▪●◦·•]\s*\S/.test(l)).map((l) => l.replace(/^[-•*▪●◦·•]\s*/, ''));
  const startsWithVerb = bullets.filter((b) => ACTION_VERBS.has((b.split(/\s+/)[0] || '').toLowerCase().replace(/[^a-z]/g, ''))).length;
  const withNumbers = bullets.filter((b) => /\d/.test(b)).length;
  const half = POINTS.impact / 2;
  const verbShare = bullets.length ? startsWithVerb / bullets.length : 0;
  const numberShare = bullets.length ? withNumbers / bullets.length : 0;
  // Full marks at 60% of bullets starting with a verb and 30% carrying a number; proportional below that.
  const got = Math.round((Math.min(1, verbShare / 0.6) * half + Math.min(1, numberShare / 0.3) * half) * 10) / 10;
  const tips = [];
  if (bullets.length < 4) tips.push('Write your projects and experience as bullet points (start each line with a dash or a dot).');
  if (bullets.length >= 4 && verbShare < 0.6) tips.push('Start more bullets with an action verb: built, designed, improved, reduced, led.');
  if (bullets.length >= 4 && numberShare < 0.3) tips.push('Add numbers that show results: users, speed-ups, percentages, marks, team size.');
  return { got, max: POINTS.impact, tips, bullets: bullets.length };
}

function checkLength(text) {
  const n = words(text).length;
  let got;
  if (n >= 250 && n <= 700) got = POINTS.length;
  else if (n < 250) got = Math.round((n / 250) * POINTS.length * 10) / 10;
  else got = Math.max(0, Math.round((POINTS.length - ((n - 700) / 700) * POINTS.length) * 10) / 10);
  const tips = [];
  if (n < 250) tips.push(`Your resume is only ${n} words. Aim for about one page, 250 to 700 words: add project detail and skills.`);
  if (n > 700) tips.push(`Your resume is ${n} words. Keep it to one page for a fresher: cut the oldest and weakest items.`);
  return { got, max: POINTS.length, tips, words: n };
}

function checkKeywords(text, role) {
  const lower = text.toLowerCase();
  const list = ROLES[role]?.keywords || ROLES.software.keywords;
  const hit = list.filter((k) => lower.includes(k));
  // Full marks at 60% of the role's keywords; proportional below.
  const got = Math.round(Math.min(1, hit.length / (list.length * 0.6)) * POINTS.keywords * 10) / 10;
  const missing = list.filter((k) => !hit.includes(k));
  const tips = got < POINTS.keywords ? [`Skills this role looks for that are missing: ${missing.slice(0, 8).join(', ')}. Add the ones you really have.`] : [];
  return { got, max: POINTS.keywords, tips, matched: hit, missing };
}

function checkClean(text) {
  const tips = [];
  const letters = text.replace(/[^A-Za-z]/g, '');
  const upper = letters.replace(/[^A-Z]/g, '').length;
  let lose = 0;
  if (letters.length > 200 && upper / letters.length > 0.5) { lose += 2; tips.push('Too much of the text is in capital letters. Use normal case except for headings.'); }
  if (lines(text).some((l) => l.length > 260)) { lose += 2; tips.push('Some lines are very long. Break them into short bullets.'); }
  if (/\b(\w{4,})\s+\1\b/i.test(text)) { lose += 1; tips.push('A word is repeated twice in a row. Proofread once more.'); }
  return { got: Math.max(0, POINTS.clean - lose), max: POINTS.clean, tips };
}

/**
 * @param {string} text  the resume as plain text
 * @param {'software'|'data'|'general'} [role]
 */
function scoreResume(text, role = 'software') {
  const clean = String(text ?? '');
  const roleKey = ROLES[role] ? role : 'software';
  if (words(clean).length < 30) {
    return { error: 'Paste your whole resume as text (at least a few lines) to get a score.' };
  }
  const parts = {
    contact: checkContact(clean), sections: checkSections(clean), summary: checkSummary(clean), impact: checkImpact(clean),
    length: checkLength(clean), keywords: checkKeywords(clean, roleKey), clean: checkClean(clean),
  };
  const score = Math.round(Object.values(parts).reduce((n, p) => n + p.got, 0));
  const band = score >= 75 ? 'strong' : score >= 55 ? 'good' : score >= 35 ? 'needs_work' : 'weak';
  return {
    score, band, role: roleKey, roleLabel: ROLES[roleKey].label,
    breakdown: Object.entries(parts).map(([key, p]) => ({ key, got: Math.round(p.got * 10) / 10, max: p.max })),
    suggestions: Object.values(parts).flatMap((p) => p.tips),
    facts: { words: parts.length.words, bullets: parts.impact.bullets, keywordsFound: parts.keywords.matched.length },
    note: 'This is a checklist of common resume rules, not a judgement of your experience. A recruiter or your placement cell should still read it.',
  };
}

module.exports = { scoreResume, ROLES, POINTS };
