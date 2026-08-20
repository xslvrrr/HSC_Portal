/**
 * Which paper is worth sitting.
 *
 * The library used to list strictly newest-first, which is a defensible order
 * and a poor recommendation: it puts an unsolved 2025 assessment task from a
 * school with four papers in the index above the 2019 official HSC paper with
 * full solutions that everyone actually sits. Year is one signal among several
 * and on its own it is the weakest of them.
 *
 * "Consensus" here means the agreement of the signals the index does carry,
 * rather than a vote nobody has collected:
 *
 *   · what kind of paper it is — an official HSC paper is the reference exam for
 *     the course, a school trial is written to imitate it, an assessment task is
 *     neither;
 *   · whether it comes with solutions, without which a sitting cannot be marked
 *     and half its value is gone;
 *   · how the school it came from stands across the whole index — schools that
 *     contribute steadily, across many courses and years, and whose papers
 *     usually arrive with solutions, are the schools whose trials circulate;
 *   · how recent it is, which still matters because syllabuses move.
 *
 * The weights are deliberately flat. Nothing here is precise enough to deserve a
 * finely tuned model, and a flat blend degrades gracefully — a paper has to be
 * poor on several counts at once to sink.
 */

const CURRENT_YEAR = new Date().getFullYear();

/** Years past which a paper stops being penalised any further for its age. */
const RECENCY_HORIZON_YEARS = 22;

/** How much each kind of paper is worth as practice, before anything else. */
const CATEGORY_WEIGHT = {
  H: 1,     // Official HSC — the exam the course is actually assessed by
  T: 0.84,  // School trial — written to imitate it
  A: 0.46,  // Assessment task — narrower, and rarely full length
  O: 0.28,  // Other resource
};

const WEIGHTS = {
  category: 0.30,
  school: 0.26,
  solutions: 0.22,
  recency: 0.22,
};

function clamp01(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

function yearOf(paper) {
  const year = parseInt(String(paper?.y), 10);
  return Number.isFinite(year) ? year : 0;
}

function recencyOf(paper) {
  const year = yearOf(paper);
  if (!year) return 0;
  return clamp01(1 - (CURRENT_YEAR - year) / RECENCY_HORIZON_YEARS);
}

/**
 * How each school stands across the whole index, on a 0–1 scale.
 *
 * Volume is taken as a logarithm: the difference between a school with four
 * papers and one with forty is real, the difference between forty and four
 * hundred is mostly an artefact of who happened to upload a back catalogue.
 */
function buildSchoolStanding(papers) {
  const bySchool = new Map();

  papers.forEach((paper) => {
    const key = paper.h;
    if (key === undefined || key === null) return;
    let entry = bySchool.get(key);
    if (!entry) {
      entry = { count: 0, solved: 0, subjects: new Set(), latestYear: 0 };
      bySchool.set(key, entry);
    }
    entry.count += 1;
    if (paper.w === 1) entry.solved += 1;
    entry.subjects.add(paper.s);
    entry.latestYear = Math.max(entry.latestYear, yearOf(paper));
  });

  const maxCount = Math.max(1, ...[...bySchool.values()].map((entry) => Math.log1p(entry.count)));
  const maxSubjects = Math.max(1, ...[...bySchool.values()].map((entry) => entry.subjects.size));

  const standing = new Map();
  bySchool.forEach((entry, key) => {
    const breadth = entry.subjects.size / maxSubjects;
    const volume = Math.log1p(entry.count) / maxCount;
    const solutionRate = entry.count > 0 ? entry.solved / entry.count : 0;
    const stillActive = clamp01(1 - (CURRENT_YEAR - entry.latestYear) / 10);

    standing.set(key, {
      count: entry.count,
      subjects: entry.subjects.size,
      solutionRate,
      score: clamp01(
        volume * 0.38
        + breadth * 0.26
        + solutionRate * 0.2
        + stillActive * 0.16,
      ),
    });
  });

  return standing;
}

/**
 * Builds the consensus scorer for one paper list.
 *
 * The standing is derived from every paper handed in, not from the current
 * search, so filtering to one subject does not quietly redefine which schools
 * count as prolific.
 *
 * @param {Array<object>} papers every paper in the index
 * @returns {{ scoreFor: (paper: object) => number, standingFor: (paper: object) => object|null, explain: (paper: object) => string }}
 */
export function buildPaperConsensus(papers = []) {
  const standing = buildSchoolStanding(papers);
  const cache = new Map();

  const standingFor = (paper) => standing.get(paper?.h) || null;

  const scoreFor = (paper) => {
    if (!paper) return 0;
    const key = `${paper.v}_${paper.n}`;
    const cached = cache.get(key);
    if (cached !== undefined) return cached;

    const school = standingFor(paper);
    const score = clamp01(
      WEIGHTS.category * (CATEGORY_WEIGHT[paper.c] ?? CATEGORY_WEIGHT.O)
      + WEIGHTS.school * (school ? school.score : 0)
      + WEIGHTS.solutions * (paper.w === 1 ? 1 : 0)
      + WEIGHTS.recency * recencyOf(paper),
    );

    cache.set(key, score);
    return score;
  };

  const explain = (paper, schoolName) => {
    const school = standingFor(paper);
    const parts = [];
    if (paper?.c === 'H') parts.push('official HSC paper');
    else if (paper?.c === 'T') parts.push('school trial');
    if (paper?.w === 1) parts.push('has solutions');
    if (school && school.count >= 10) {
      parts.push(`${schoolName || 'this school'} contributes ${school.count} papers across ${school.subjects} courses`);
    }
    parts.push(`${paper?.y || 'undated'}`);
    return `Ranked ${Math.round(scoreFor(paper) * 100)}/100 — ${parts.join(', ')}`;
  };

  return { scoreFor, standingFor, explain };
}

/** The orders the library offers, newest-first kept as the plain alternative. */
export const SORT_MODES = [
  { id: 'consensus', label: 'Best regarded', note: 'ranked by paper type, solutions, school standing and year' },
  { id: 'newest', label: 'Newest', note: 'most recent year first' },
  { id: 'school', label: 'School', note: 'alphabetical by school' },
];

/**
 * @param {Array<object>} papers already filtered
 * @param {string} mode one of {@link SORT_MODES}
 * @param {{ consensus: object, schools: string[] }} context
 */
export function sortPapers(papers, mode, { consensus, schools = [] } = {}) {
  const nameOf = (paper) => String(schools[paper.h] || paper.n || '');
  const byYearDescending = (left, right) => yearOf(right) - yearOf(left);

  if (mode === 'newest') {
    return [...papers].sort((left, right) => (
      byYearDescending(left, right) || nameOf(left).localeCompare(nameOf(right))
    ));
  }

  if (mode === 'school') {
    return [...papers].sort((left, right) => (
      nameOf(left).localeCompare(nameOf(right)) || byYearDescending(left, right)
    ));
  }

  return [...papers].sort((left, right) => {
    const delta = consensus.scoreFor(right) - consensus.scoreFor(left);
    // A hair's difference in score is noise; fall back to year so the order
    // inside a band is still the one a reader would predict.
    if (Math.abs(delta) > 0.001) return delta;
    return byYearDescending(left, right) || nameOf(left).localeCompare(nameOf(right));
  });
}
