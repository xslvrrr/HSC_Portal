/**
 * The practice ladder.
 *
 * The reworked portal treats time allowance as something you earn rather than
 * something you pick: each subject sits on a rung from 1 to 5, the rung is
 * derived from your recent sittings, and the rung sets the allowance offered
 * for the next paper. This module holds that derivation so the Today view, the
 * library quick-start and the post-sitting review all agree on the numbers.
 */

import {
  HEADLINE_EMPTY,
  HEADLINE_GENEROUS,
  HEADLINE_SHARP,
  HEADLINE_TIGHT,
  LEDE_EMPTY,
  LEDE_FIRST_SITTING,
  LEDE_ON_A_RUN,
  LEDE_STEADY,
  LEDE_UNMARKED,
  daySeed,
  pick,
  say,
} from './copyPool';

/** Allowance offered at each rung, from most generous to tightest. */
export const ALLOWANCES = [
  { id: 'untimed', label: 'Untimed', multiplier: null },
  { id: 'plus20', label: '+20%', multiplier: 1.2 },
  { id: 'plus10', label: '+10%', multiplier: 1.1 },
  { id: 'toTime', label: 'To time', multiplier: 1 },
  { id: 'minus10', label: '−10%', multiplier: 0.9 },
];

export const MAX_RUNG = ALLOWANCES.length;

/** Sittings above this percentage count towards moving up a rung. */
export const HOLDING_MARK = 72;

/** Where onboarding stores the starting rung the student reported per subject. */
export const CONFIDENCE_SEED_STORAGE_KEY = 'hsc_confidence_seed';
/** Sittings considered when reading a subject's current form. */
const RECENT_SITTINGS = 3;

const SCORE_BANDS = [
  { below: 50, rung: 1 },
  { below: 60, rung: 2 },
  { below: HOLDING_MARK, rung: 3 },
  { below: 82, rung: 4 },
];

export function clampRung(value) {
  if (!Number.isFinite(value)) return 1;
  return Math.min(MAX_RUNG, Math.max(1, Math.round(value)));
}

export function getAllowanceForRung(rung) {
  return ALLOWANCES[clampRung(rung) - 1];
}

export function findAllowance(allowanceId) {
  return ALLOWANCES.find((allowance) => allowance.id === allowanceId) || null;
}

/** A review only carries a percentage when both a score and a total were entered. */
export function getReviewPercent(review) {
  const score = Number(review?.score);
  const total = Number(review?.totalMarks);
  if (!Number.isFinite(score) || !Number.isFinite(total) || total <= 0) return null;
  return Math.round((score / total) * 100);
}

function rungFromScore(percent) {
  const band = SCORE_BANDS.find((entry) => percent < entry.below);
  return band ? band.rung : MAX_RUNG;
}

/** The rungs the student reported during onboarding, before any sittings. */
export function loadConfidenceSeeds() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CONFIDENCE_SEED_STORAGE_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (error) {
    return {};
  }
}

export function saveConfidenceSeeds(seeds) {
  try {
    localStorage.setItem(CONFIDENCE_SEED_STORAGE_KEY, JSON.stringify(seeds || {}));
  } catch (error) {
    // Seeds are a convenience; the ladder still works from sittings alone.
  }
}

/**
 * Reads one subject's form from its reviews, newest first.
 *
 * @param {Array<object>} reviews
 * @param {{ seedRung?: number|null }} options a self-reported starting rung,
 *   used only until real sittings exist.
 * @returns {{ rung: number, sittings: number, streak: number, lastPercent: number|null, lastAt: number|null, averagePercent: number|null, isSeeded: boolean }}
 */
export function readSubjectForm(reviews = [], { seedRung = null } = {}) {
  const ordered = [...reviews].sort((left, right) => (
    (Number(right?.createdAt) || 0) - (Number(left?.createdAt) || 0)
  ));

  if (ordered.length === 0) {
    return {
      rung: seedRung ? clampRung(seedRung) : 1,
      sittings: 0,
      streak: 0,
      lastPercent: null,
      lastAt: null,
      averagePercent: null,
      isSeeded: Boolean(seedRung),
    };
  }

  const recent = ordered.slice(0, RECENT_SITTINGS);
  const percents = recent.map(getReviewPercent).filter((percent) => percent !== null);
  const confidences = recent
    .map((review) => Number(review?.confidence))
    .filter((confidence) => Number.isFinite(confidence) && confidence > 0);

  const averagePercent = percents.length
    ? Math.round(percents.reduce((sum, percent) => sum + percent, 0) / percents.length)
    : null;
  const averageConfidence = confidences.length
    ? confidences.reduce((sum, confidence) => sum + confidence, 0) / confidences.length
    : null;

  // Marks lead, self-reported confidence moderates. Either alone still gives a rung.
  let rung;
  if (averagePercent !== null && averageConfidence !== null) {
    rung = (rungFromScore(averagePercent) * 2 + averageConfidence) / 3;
  } else if (averagePercent !== null) {
    rung = rungFromScore(averagePercent);
  } else if (averageConfidence !== null) {
    rung = averageConfidence;
  } else {
    rung = 2;
  }

  let streak = 0;
  for (const review of ordered) {
    const percent = getReviewPercent(review);
    if (percent === null || percent < HOLDING_MARK) break;
    streak += 1;
  }

  return {
    rung: clampRung(rung),
    sittings: ordered.length,
    streak,
    lastPercent: getReviewPercent(ordered[0]),
    lastAt: Number(ordered[0]?.createdAt) || null,
    averagePercent,
    isSeeded: false,
  };
}

/**
 * Builds the ladder shown on Today: one row per subject the student studies.
 * Subjects with no sittings still appear, on rung 1, so the ladder is a plan
 * rather than a scoreboard.
 */
export function buildLadder({ subjects = [], reviews = [], seeds = null } = {}) {
  const confidenceSeeds = seeds || loadConfidenceSeeds();
  const reviewsBySubject = new Map();
  reviews.forEach((review) => {
    const name = String(review?.subjectName || '').trim();
    if (!name) return;
    if (!reviewsBySubject.has(name)) reviewsBySubject.set(name, []);
    reviewsBySubject.get(name).push(review);
  });

  const names = subjects.length > 0 ? subjects : [...reviewsBySubject.keys()];

  return names.map((name) => {
    const form = readSubjectForm(reviewsBySubject.get(name) || [], {
      seedRung: confidenceSeeds[name] ?? null,
    });
    return {
      subject: name,
      ...form,
      allowance: getAllowanceForRung(form.rung),
    };
  });
}

/**
 * Picks the subject that has waited longest for attention: never-sat subjects
 * first, then the weakest form, then the least recently sat.
 */
export function chooseNextSubject(ladder = []) {
  if (ladder.length === 0) return null;
  return [...ladder].sort((left, right) => {
    if (left.sittings !== right.sittings && (left.sittings === 0 || right.sittings === 0)) {
      return left.sittings - right.sittings;
    }
    if (left.rung !== right.rung) return left.rung - right.rung;
    return (left.lastAt || 0) - (right.lastAt || 0);
  })[0];
}

/**
 * The sentence under the Today headline — why this paper, at this allowance.
 * Wording comes from a pool rather than the language model, so it varies by day
 * without a network call.
 */
export function describePrescription(entry, seed = daySeed()) {
  if (!entry) {
    return pick(LEDE_EMPTY, seed);
  }

  const shared = {
    subject: entry.subject,
    allowance: entry.allowance.label.toLowerCase(),
    rung: entry.rung,
    max: MAX_RUNG,
    mark: HOLDING_MARK,
  };
  const scopedSeed = `${seed}:${entry.subject}`;

  if (entry.sittings === 0) {
    return say(LEDE_FIRST_SITTING, scopedSeed, shared);
  }
  if (entry.streak >= 3) {
    return say(LEDE_ON_A_RUN, scopedSeed, { ...shared, streak: entry.streak });
  }
  if (entry.lastPercent !== null) {
    return say(LEDE_STEADY, scopedSeed, { ...shared, percent: entry.lastPercent });
  }
  return say(LEDE_UNMARKED, scopedSeed, {
    ...shared,
    count: entry.sittings,
    plural: entry.sittings === 1 ? '' : 's',
  });
}

/**
 * The Today headline. Which pool is used depends on how tight the allowance is,
 * so the sentence always agrees with the paper being offered.
 */
export function describeHeadline(entry, seed = daySeed()) {
  if (!entry) return pick(HEADLINE_EMPTY, seed);

  const multiplier = entry.allowance.multiplier;
  const pool = multiplier === null || multiplier > 1
    ? HEADLINE_GENEROUS
    : multiplier === 1
      ? HEADLINE_TIGHT
      : HEADLINE_SHARP;

  return say(pool, `${seed}:${entry.subject}`, { subject: entry.subject });
}

/**
 * Groups the mistake log into the topics worth an hour, heaviest first.
 * @returns {Array<{ topic: string, subject: string, count: number }>}
 */
export function buildWeakSpots(mistakes = [], limit = 4) {
  const byTopic = new Map();

  mistakes.forEach((mistake) => {
    const topic = String(mistake?.topic || '').trim() || String(mistake?.category || '').trim();
    if (!topic) return;
    const subject = String(mistake?.subjectName || '').trim();
    const key = `${subject}::${topic}`;
    const existing = byTopic.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      byTopic.set(key, { topic, subject, count: 1 });
    }
  });

  return [...byTopic.values()]
    .sort((left, right) => right.count - left.count)
    .slice(0, limit);
}

/** Seconds on the clock for a paper of `minutes` sat at the given allowance. */
export function allowanceSeconds(minutes, allowanceId) {
  const allowance = findAllowance(allowanceId);
  const safeMinutes = Number(minutes);
  if (!allowance || !allowance.multiplier || !Number.isFinite(safeMinutes)) return null;
  return Math.round(safeMinutes * 60 * allowance.multiplier);
}
