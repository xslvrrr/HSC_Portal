/**
 * How long a paper in each course usually runs.
 *
 * The index carries no duration: `papers.json` knows a paper's school, year,
 * subject and whether it has solutions, and nothing about the clock. The real
 * allowance is printed on the paper's own front page and is read out of it when
 * the paper is opened — see `paperTiming.js` — but the library has to show
 * something before the PDF is fetched, and "how long is this going to take" is
 * the first thing a student wants to know when choosing between two papers.
 *
 * So these are the course's standard NESA written-exam working times, used as an
 * estimate and labelled as one. A trial paper generally mirrors the HSC paper
 * for the same course, which is what makes the estimate worth showing at all;
 * where a course sits two papers of different lengths, the longer is given.
 */

const HOUR = 60;

/** Working minutes by subject name, exactly as `papers.json` spells them. */
const SUBJECT_MINUTES = {
  'Agriculture': 3 * HOUR,
  'Ancient History': 3 * HOUR,
  'Biology': 3 * HOUR,
  'Business Studies': 3 * HOUR,
  'Chemistry': 3 * HOUR,
  'Economics': 3 * HOUR,
  'Engineering Studies': 3 * HOUR,
  // Paper 1 runs 1 h 30 and Paper 2 runs 2 h; the index does not say which.
  'English Advanced': 2 * HOUR,
  'English Standard': 2 * HOUR,
  'English Ext 1': 2 * HOUR,
  'General Maths': 2 * HOUR + 30,
  'History Extension': 2 * HOUR,
  'IPT': 3 * HOUR,
  'Investigating Science': 2 * HOUR,
  'Legal Studies': 3 * HOUR,
  'Maths (2U)': 3 * HOUR,
  'Maths Ext 1': 2 * HOUR,
  'Maths Ext 2': 3 * HOUR,
  'Modern History': 3 * HOUR,
  'PDHPE': 3 * HOUR,
  'Physics': 3 * HOUR,
  'Software Engineering': 3 * HOUR,
  'Standard Maths': 2 * HOUR + 30,
  'Studies of Religion 1': HOUR + 30,
  'Studies of Religion 2': 3 * HOUR,
  'Visual Arts': HOUR + 30,
};

/** Courses whose two papers run to different lengths, so the estimate is a ceiling. */
const SPLIT_PAPER_SUBJECTS = new Set(['English Advanced', 'English Standard']);

/** Everything in NSW that is not a short paper runs three hours. */
const FALLBACK_MINUTES = 3 * HOUR;

/**
 * @param {string} subjectName
 * @returns {{ minutes: number, isExact: boolean }} `isExact` is false wherever
 *   the course sits papers of more than one length, or the subject is unknown.
 */
export function getSubjectTiming(subjectName) {
  const minutes = SUBJECT_MINUTES[String(subjectName || '').trim()];
  if (!minutes) return { minutes: FALLBACK_MINUTES, isExact: false };
  return { minutes, isExact: !SPLIT_PAPER_SUBJECTS.has(subjectName) };
}

/** "3 h", "2 h 30", "45 min" — short enough to sit on a card. */
export function formatMinutes(minutes) {
  const safe = Math.max(0, Math.round(Number(minutes) || 0));
  if (safe < 60) return `${safe} min`;
  const hours = Math.floor(safe / 60);
  const remainder = safe % 60;
  return remainder ? `${hours} h ${remainder}` : `${hours} h`;
}

/** The line a card shows, and the sentence its title attribute explains it with. */
export function describeSubjectTiming(subjectName) {
  const { minutes, isExact } = getSubjectTiming(subjectName);
  return {
    minutes,
    label: `${isExact ? '' : '~'}${formatMinutes(minutes)}`,
    detail: isExact
      ? `${formatMinutes(minutes)} working time — the standard length for ${subjectName}`
      : `About ${formatMinutes(minutes)} — ${subjectName} papers vary, and the paper states its own allowance when you open it`,
  };
}
