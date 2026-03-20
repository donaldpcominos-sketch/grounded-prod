// src/data/prompts.js
// Curated journal prompt bank — 42 prompts (6 weeks × 7 days)
// Organised by day-of-week theme.
//
// Rotation: getTodayPrompt() uses dayOfYear % poolForDay.length
// so the same prompt doesn't repeat within 6 weeks.
// Nico-specific prompts are sprinkled across the week.

// ─── Monday — Orientation, intention ─────────────────────────────────────────

const monday = [
  "What would make this week feel worthwhile?",
  "What is one thing you want to protect time for this week?",
  "If this week goes well, what does that look like?",
  "What intention do you want to carry into the next few days?",
  "Is there anything you need to let go of before the week begins?",
  "What does a nourished, steady version of you need most right now?"
];

// ─── Tuesday — Body, energy, physical state ───────────────────────────────────

const tuesday = [
  "How is your body feeling today — honestly?",
  "Where do you notice tension, ease, or tiredness right now?",
  "What has your body asked of you lately that you haven't had time to give?",
  "If your body could speak, what would it say today?",
  "What is one small thing you could do today that would feel like rest?",
  "What does physical strength mean to you right now, in this season?"
];

// ─── Wednesday — Mood, emotions, internal weather ────────────────────────────

const wednesday = [
  "What has been draining your energy lately?",
  "What emotion keeps surfacing that you haven't had space to sit with?",
  "What made you feel most like yourself this week?",
  "Is there something you are carrying that deserves to be put down for a moment?",
  "What do you need to hear right now that no one has said?",
  "What does your emotional landscape look like today — cloudy, clear, stormy, still?"
];

// ─── Thursday — Reflection, motherhood, meaning ──────────────────────────────

const thursday = [
  "What did Nico do recently that made you laugh?",
  "Write something you want to remember about right now — even the small things.",
  "What part of motherhood surprised you this week, in any direction?",
  "What do you wish someone had told you about this season of life?",
  "What is something Nico has shown you about yourself?",
  "Describe a moment from this week you would like to keep."
];

// ─── Friday — Wind-down, gratitude, completion ────────────────────────────────

const friday = [
  "What is one thing that went better than expected this week?",
  "What were you quietly proud of this week, even if no one noticed?",
  "What was the kindest thing someone did for you this week?",
  "What is something small — a smell, a sound, a moment — that you appreciated today?",
  "What would you tell yourself at the start of this week, knowing what you know now?",
  "What is one thing you are genuinely grateful for right now?"
];

// ─── Saturday — Spacious, creative, exploratory ──────────────────────────────

const saturday = [
  "Describe this season of your life in three words.",
  "If you had a completely free afternoon, what would you actually want to do?",
  "What does your ideal version of rest look like right now?",
  "What is something you used to love that you haven't made space for lately?",
  "If you could write a letter to yourself from a year from now, what would it say?",
  "What is something you are still figuring out, and that is okay?"
];

// ─── Sunday — Reset, looking forward, closing the loop ───────────────────────

const sunday = [
  "What does a good week ahead look like for you?",
  "Is there anything unfinished from this week that needs a moment of acknowledgement?",
  "What do you want more of next week?",
  "What do you want less of next week?",
  "What is one thing you could do this week to take care of future-you?",
  "As this week closes, what feeling do you want to carry forward?"
];

// ─── Pool map by day of week (0 = Sunday, 1 = Monday … 6 = Saturday) ─────────

const promptsByDay = {
  0: sunday,
  1: monday,
  2: tuesday,
  3: wednesday,
  4: thursday,
  5: friday,
  6: saturday
};

// ─── Day-of-year helper ───────────────────────────────────────────────────────

function getDayOfYear(date = new Date()) {
  const start = new Date(date.getFullYear(), 0, 0);
  const diff = date - start;
  const oneDay = 1000 * 60 * 60 * 24;
  return Math.floor(diff / oneDay);
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns today's prompt string.
 * Uses dayOfYear % pool.length so the same prompt doesn't repeat
 * within the first 6 weeks of a given day-of-week.
 */
export function getTodayPrompt() {
  const today = new Date();
  const dayOfWeek = today.getDay(); // 0–6
  const pool = promptsByDay[dayOfWeek] ?? monday;
  const index = getDayOfYear(today) % pool.length;
  return pool[index];
}
