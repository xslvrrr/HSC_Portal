/**
 * Dynamic copy pools.
 *
 * The portal used to lean on the language model for lines it could write
 * itself. Every recurring sentence now comes from a pool of hand-written
 * variants, picked deterministically from a seed, so the wording changes day to
 * day without a network call, an API key, or a chance of invention.
 *
 * A pick is stable for a given seed: the same student, on the same day, in the
 * same subject sees the same sentence all session.
 */

/** Small, fast, stable string hash. Not cryptographic — only used to pick. */
function hashSeed(seed) {
  const text = String(seed ?? '');
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return Math.abs(hash);
}

/**
 * Picks one entry from a pool.
 * @param {Array<string>} pool
 * @param {string} seed anything stable — a date, a subject, a paper id
 */
export function pick(pool, seed) {
  if (!Array.isArray(pool) || pool.length === 0) return '';
  return pool[hashSeed(seed) % pool.length];
}

/** Fills `{name}` style placeholders. Unknown keys are left untouched. */
export function fill(template, values = {}) {
  return String(template).replace(/\{(\w+)\}/g, (match, key) => (
    Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match
  ));
}

/** Picks and fills in one step. */
export function say(pool, seed, values) {
  return fill(pick(pool, seed), values);
}

/** Today's date, as a seed component, in the student's own timezone. */
export function daySeed(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

// ── Today ───────────────────────────────────────────────────────────────────

/** Headline when the ladder is offering extra time. */
export const HEADLINE_GENEROUS = [
  '{subject}, and take as long as it needs.',
  '{subject} today — untimed, and read the question twice.',
  'Start with {subject}. The clock can wait.',
  '{subject}, open book. Build the method first.',
];

/** Headline at or near full exam conditions. */
export const HEADLINE_TIGHT = [
  '{subject}, and give it the full three hours.',
  '{subject} today — to time, closed book.',
  'Sit {subject} as though it counted.',
  '{subject}, start to finish, no stopping.',
];

/** Headline once the allowance has tightened past exam time. */
export const HEADLINE_SHARP = [
  '{subject}, and finish early.',
  '{subject} — ten per cent under, start now.',
  'Sit {subject} short. You have the margin.',
];

export const HEADLINE_EMPTY = [
  'Choose your subjects and the ladder will take it from there.',
  'Tell the portal what you study and it will prescribe the rest.',
  'Nothing prescribed yet — pick your subjects to begin.',
];

/** Reasoning under the headline, for a subject with no sittings logged. */
export const LEDE_FIRST_SITTING = [
  'You have not sat a {subject} paper here yet. Start untimed and open book — the ladder tightens the allowance once it can see your marks.',
  'This is your first {subject} paper on the portal. Take it slowly, mark it honestly, and the allowance will follow your form.',
  'No {subject} sittings on record. Work through this one without the clock; the ladder needs a mark before it can move.',
];

/** Reasoning when a run of good sittings has tightened the allowance. */
export const LEDE_ON_A_RUN = [
  'You have held above {mark}% for {streak} sittings in a row. The ladder moves you off the leeway: sit this one at {allowance}, closed book, and log the questions you leave blank rather than guessing them.',
  '{streak} sittings above {mark}% — that is a pattern, not luck. Take this one at {allowance} and treat the blanks as information.',
  'Your last {streak} {subject} papers all cleared {mark}%. The allowance tightens to {allowance}; the difficulty is meant to bite.',
];

/** Reasoning from an ordinary recent mark. */
export const LEDE_STEADY = [
  'Your last {subject} sitting came in at {percent}%. The ladder holds you on rung {rung} of {max} — sit this one at {allowance} and review it properly afterwards.',
  'You marked {percent}% last time out in {subject}. Rung {rung} of {max}, so the allowance stays at {allowance}. The review afterwards matters more than the mark.',
  '{percent}% on your last {subject} paper. Nothing has changed on the ladder yet — {allowance}, and log what you got wrong.',
];

/** Reasoning when sittings exist but carry no marks. */
export const LEDE_UNMARKED = [
  'You have {count} {subject} sitting{plural} logged without marks. Add a score when you review the next one and the ladder can start moving.',
  '{count} {subject} paper{plural} sat, none marked. The ladder is blind until you enter a score.',
];

export const LEDE_EMPTY = [
  'Pick the subjects you study and the ladder will prescribe your next sitting.',
  'Once the portal knows your subjects it can choose the paper, the allowance and the order.',
];

// ── Weak spots and the notebook ─────────────────────────────────────────────

export const WEAK_SPOT_NOTE = [
  'Drawn from the questions you marked wrong. Open book, untimed.',
  'These come straight from your notebook. Work them slowly, without the clock.',
  'The topics your mistakes keep landing on. An hour each, open book.',
];

export const EMPTY_WEAK_SPOTS = [
  'Nothing logged yet. Review a sitting and the mistakes you record will collect here.',
  'No mistakes on file. They appear here as soon as you log one in a review.',
];

// ── The agent, when it answers locally ──────────────────────────────────────

export const AGENT_NO_MATCH = [
  'Nothing in the index matches that. Try a subject, a school, or a year.',
  'No papers on that. A shorter search usually works better.',
];

export const AGENT_GREETING = [
  'Ask about a question, a topic, or your marks.',
  'I can search the index, read your ladder, and pencil sittings in.',
  'Ask what to sit next, or what your mistakes have in common.',
];
