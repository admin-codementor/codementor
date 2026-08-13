// Diagnoses GEMINI_API_KEY without going through the app.
//
// Why this exists: a key can authenticate well enough to LIST models and still be
// refused for generation (403 "Your project has been denied access"), which is a
// project-level block, not a bad key. Listing alone therefore proves nothing —
// this script checks the call the app actually makes.
//
//   node src/scripts/checkAiKey.js            # checks the key in backend/.env
//   GEMINI_API_KEY=AIza... node src/scripts/checkAiKey.js   # checks a candidate key
require('dotenv').config({ quiet: true });

const API = 'https://generativelanguage.googleapis.com/v1beta';
// Keep in step with the model id used in ai.controller.js / the AI gateway.
const MODEL = process.env.GEMINI_MODEL || 'gemini-flash-latest';
const key = process.env.GEMINI_API_KEY;

const line = (label, value) => console.log(`${label.padEnd(22)} ${value}`);

(async () => {
  if (!key) {
    console.log('GEMINI_API_KEY is not set.\n');
    console.log('Get one at https://aistudio.google.com/apikey — choose');
    console.log('"Create API key in a new project", then add it to backend/.env as');
    console.log('  GEMINI_API_KEY=AIza...');
    process.exit(1);
  }
  line('key', `${key.slice(0, 6)}…${key.slice(-4)} (${key.length} chars)`);
  line('model', MODEL);
  console.log('');

  // 1. Can the key see the catalogue at all?
  let models = [];
  try {
    const res = await fetch(`${API}/models?key=${key}`);
    const json = await res.json().catch(() => null);
    if (res.status !== 200) {
      line('list models', `FAIL — HTTP ${res.status} ${json?.error?.status || ''}`);
      console.log(`\n  ${json?.error?.message || 'no message'}`);
      console.log('\n→ The key itself is rejected. Re-copy it, or create a new one.');
      process.exit(1);
    }
    models = (json.models || []).map((m) => m.name.replace('models/', ''));
    line('list models', `OK — ${models.length} available`);
  } catch (e) {
    line('list models', `FAIL — ${e.message}`);
    console.log('\n→ Network/DNS problem reaching Google, not a key problem.');
    process.exit(1);
  }

  if (!models.includes(MODEL)) {
    line('model present', `NO — "${MODEL}" is not in this key's catalogue`);
    const flash = models.filter((m) => m.includes('flash')).slice(0, 6);
    if (flash.length) console.log(`\n  Available flash models: ${flash.join(', ')}`);
    console.log('\n→ Update the model id (models get retired — gemini-2.0-flash already is).');
    process.exit(1);
  }
  line('model present', 'OK');

  // 2. The call that actually matters.
  const res = await fetch(`${API}/models/${MODEL}:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: 'Reply with the single word OK' }] }] }),
  });
  const json = await res.json().catch(() => null);

  if (res.status === 200) {
    const text = json?.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    line('generateContent', `OK — model replied ${JSON.stringify(text)}`);
    console.log('\nAI features are good to go.');
    process.exit(0);
  }

  line('generateContent', `FAIL — HTTP ${res.status} ${json?.error?.status || ''}`);
  console.log(`\n  ${json?.error?.message || 'no message'}\n`);

  if (res.status === 403 && /denied access/i.test(json?.error?.message || '')) {
    console.log('→ The Google project behind this key is blocked, not the key.');
    console.log('  Create a key in a NEW project at https://aistudio.google.com/apikey');
    console.log('  ("Create API key in a new project"). A new key in the same project fails the same way.');
    console.log('  If a brand-new project is also denied, it is account-level — try a different');
    console.log('  Google account or contact Google support.');
  } else if (res.status === 429) {
    console.log('→ Rate/quota limit. The free tier is low; enable billing on the project');
    console.log('  for exam-day load (see docs/scale-readiness/14-ai-features.md §14.5 for the cost model).');
  } else if (res.status === 400 && /API key not valid/i.test(json?.error?.message || '')) {
    console.log('→ Key is malformed or from a different service. Re-copy it from AI Studio.');
  }
  process.exit(1);
})();
