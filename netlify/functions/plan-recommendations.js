// netlify/functions/plan-recommendations.js
//
// AI copy-polish layer for Today Plans.
// Called AFTER deterministic scoring has already selected the 3 candidates.
//
// Contract (critical — enforced by schema validation before returning):
//   - Input:  exactly 3 pre-selected candidates + TodayPlanContext
//   - Output: exactly 3 structured objects with enhanced copy only
//   - AI must NOT change: id, name, address, driveMinutes, walkable, rating
//   - AI may enhance: description (1 sentence), whyNow (1 sentence), tags (array)
//
// If AI response is malformed, invalid, or times out:
//   → return { ok: false } so the client falls back to deterministic copy
//
// Token budget: kept small on purpose.
//   - No full place descriptions sent to AI
//   - System prompt is short and unambiguous
//   - Max output: ~200 tokens

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const MODEL             = 'claude-haiku-4-5-20251001'; // fast + cheap for copy tasks

// ─── System prompt ────────────────────────────────────────────────────────────
// Short and directive. AI receives structured data and must return structured data.

const SYSTEM_PROMPT = `You write short, warm, practical copy for a parent + baby outing app.
You receive context about the parent's mood, baby's mood, weather, and 3 pre-selected place recommendations.
You return improved one-sentence descriptions and why-now lines for each place.
Rules:
- Return ONLY valid JSON. No markdown, no preamble.
- Return exactly 3 objects in the same order as input.
- Each object has exactly: id (unchanged), description (1 sentence, max 15 words), whyNow (1 sentence, max 15 words).
- Do not invent facts. Do not mention specific times, prices, or features you cannot confirm.
- Tone: calm, warm, practical. Not enthusiastic. Not generic.`;

// ─── Prompt builder ───────────────────────────────────────────────────────────
// Minimal — we only send what AI needs for copy. Not full place data.

function buildUserPrompt(candidates, context) {
  const contextSummary = [
    `Parent feels: ${context.parentMood}`,
    `Baby seems: ${context.nicoMood}`,
    `Weather: ${context.weather}`,
    `Available time: ${context.duration}`,
    `Vibe: ${context.vibe}`,
  ].join('. ');

  const candidateSummary = candidates.map((c, i) => ({
    index: i + 1,
    id:    c.id,
    name:  c.name,
    type:  `${c.subtype} (${c.indoorOutdoor})`,
    role:  c.role,  // 'safest' | 'best' | 'fallback'
    tags:  (c.tags || []).slice(0, 3).join(', '),
  }));

  return [
    contextSummary,
    '',
    'Places (return in same order):',
    JSON.stringify(candidateSummary, null, 0),
  ].join('\n');
}

// ─── Response validation ──────────────────────────────────────────────────────
// Strict — any deviation causes fallback to deterministic copy.

function validateAiResponse(parsed, candidates) {
  if (!Array.isArray(parsed) || parsed.length !== 3) return false;

  for (let i = 0; i < 3; i++) {
    const item = parsed[i];
    if (!item || typeof item !== 'object') return false;
    // id must match input order
    if (item.id !== candidates[i].id) return false;
    // description and whyNow must be non-empty strings
    if (typeof item.description !== 'string' || item.description.trim().length === 0) return false;
    if (typeof item.whyNow !== 'string'      || item.whyNow.trim().length === 0) return false;
    // Neither field should be suspiciously long (hallucination signal)
    if (item.description.split(' ').length > 25) return false;
    if (item.whyNow.split(' ').length      > 25) return false;
  }

  return true;
}

// ─── Handler ──────────────────────────────────────────────────────────────────

export const handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!ANTHROPIC_API_KEY) {
    // Graceful degradation — client will use deterministic copy
    return { statusCode: 200, body: JSON.stringify({ ok: false, reason: 'api_key_missing' }) };
  }

  let candidates, context;
  try {
    const body = JSON.parse(event.body || '{}');
    candidates = body.candidates;
    context    = body.context;

    if (!Array.isArray(candidates) || candidates.length !== 3) {
      throw new Error('candidates must be an array of exactly 3');
    }
    if (!context || typeof context !== 'object') {
      throw new Error('context is required');
    }
  } catch (err) {
    return { statusCode: 400, body: JSON.stringify({ error: err.message }) };
  }

  const userPrompt = buildUserPrompt(candidates, context);

  let aiResponse;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:  'POST',
      headers: {
        'Content-Type':      'application/json',
        'x-api-key':         ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model:      MODEL,
        max_tokens: 300,  // tight budget — 3 × ~100 tokens
        system:     SYSTEM_PROMPT,
        messages:   [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Anthropic API error ${res.status}: ${err}`);
    }

    const json = await res.json();
    const text = json.content?.[0]?.text || '';

    // Strip any accidental markdown fences
    const cleaned = text.replace(/```json|```/g, '').trim();
    const parsed  = JSON.parse(cleaned);

    if (!validateAiResponse(parsed, candidates)) {
      throw new Error('AI response failed validation');
    }

    aiResponse = parsed;

  } catch (err) {
    // Any failure → tell client to use deterministic copy
    console.error('plan-recommendations AI error:', err.message);
    return {
      statusCode: 200,
      body: JSON.stringify({ ok: false, reason: 'ai_error', detail: err.message }),
    };
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ok: true, enhancements: aiResponse }),
  };
};
