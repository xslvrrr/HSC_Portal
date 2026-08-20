/**
 * Reading and working time, read out of the paper itself.
 *
 * Every NSW paper states its own allowance on the front page, in a small set of
 * shapes: "Reading time – 5 minutes", "Working time – 3 hours", occasionally
 * "2 hours and 30 minutes". Detecting it means the timer opens on the time the
 * paper actually grants rather than a guess, and the reading phase runs because
 * the paper says it should — not because the student remembered to add it.
 *
 * Only the first page is worth reading: the allowance is always in the "General
 * Instructions" block, and scanning a whole paper for the word "minutes" finds
 * question text instead.
 */

const WORD_NUMBERS = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30,
};

/** Papers state times either in digits or in words, and mix the two freely. */
function readNumber(token) {
  if (!token) return null;
  const digits = Number(String(token).replace(/[^\d.]/g, ''));
  if (Number.isFinite(digits) && digits > 0) return digits;
  const word = WORD_NUMBERS[String(token).toLowerCase()];
  return word || null;
}

/**
 * Minutes named after a label. Handles "3 hours", "2 hours and 30 minutes",
 * "1½ hours", "90 minutes" and the en-dash, em-dash and colon separators the
 * papers use interchangeably.
 */
function minutesAfter(text, label) {
  const pattern = new RegExp(
    `${label}\\s*(?:time)?\\s*[–—:-]?\\s*` +
    `(?:(\\d+(?:[.,]\\d+)?|[a-z]+)\\s*(?:½|1/2)?\\s*(hours?|hrs?|minutes?|mins?))` +
    `(?:\\s*(?:and|,)?\\s*(\\d+|[a-z]+)\\s*(minutes?|mins?))?`,
    'i',
  );
  const match = text.match(pattern);
  if (!match) return null;

  const firstValue = readNumber(match[1]);
  if (firstValue === null) return null;

  const firstUnit = String(match[2] || '').toLowerCase();
  const isHours = firstUnit.startsWith('h');
  // "1½ hours" and "2.5 hours" both arrive here as a fractional first value.
  const half = /½|1\/2/.test(match[0]) && Number.isInteger(firstValue) ? 0.5 : 0;
  let minutes = isHours ? (firstValue + half) * 60 : firstValue + half;

  const secondValue = readNumber(match[3]);
  if (isHours && secondValue !== null) minutes += secondValue;

  return Math.round(minutes);
}

/**
 * @param {string} text first-page text, as extracted from the PDF
 * @returns {{ readingMinutes: number|null, workingMinutes: number|null, source: 'document'|'unknown' }}
 */
export function parsePaperTiming(text) {
  const flat = String(text || '')
    .replace(/\s+/g, ' ')
    // Papers hyphenate across a line break often enough to matter.
    .replace(/-\s+/g, '-')
    .slice(0, 4000);

  if (!flat) return { readingMinutes: null, workingMinutes: null, source: 'unknown' };

  const readingMinutes = minutesAfter(flat, 'reading');
  const workingMinutes = minutesAfter(flat, 'working');

  // Guard against a stray match: NSW reading allowances are 5–15 minutes and
  // papers run between half an hour and four hours.
  const safeReading = readingMinutes !== null && readingMinutes > 0 && readingMinutes <= 30
    ? readingMinutes
    : null;
  const safeWorking = workingMinutes !== null && workingMinutes >= 30 && workingMinutes <= 300
    ? workingMinutes
    : null;

  return {
    readingMinutes: safeReading,
    workingMinutes: safeWorking,
    source: safeWorking !== null || safeReading !== null ? 'document' : 'unknown',
  };
}

/** A one-line description of where the timer's length came from. */
export function describeTiming({ source, readingMinutes, workingMinutes }) {
  if (source !== 'document') return null;
  const parts = [];
  if (workingMinutes) {
    parts.push(workingMinutes >= 60
      ? `${Math.floor(workingMinutes / 60)} h${workingMinutes % 60 ? ` ${workingMinutes % 60} m` : ''} working`
      : `${workingMinutes} min working`);
  }
  if (readingMinutes) parts.push(`${readingMinutes} min reading`);
  return parts.length ? `Read from the paper — ${parts.join(', ')}` : null;
}
