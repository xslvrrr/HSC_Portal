/**
 * Exam timer state.
 *
 * Ported from the Millennium past-papers timer. Kept as pure functions over an
 * absolute deadline rather than a counter the UI decrements. Browsers throttle
 * timers in background tabs — often to once a minute — so a decrementing counter
 * runs slow by however long the student had another tab focused, and a student
 * practising exam pacing against a clock that quietly gives them extra time is
 * being trained to fail. Every read derives from `Date.now()` against a stored
 * deadline, so the clock is correct the instant the tab is focused again.
 */

export const MIN_TIMER_MINUTES = 5;
export const MAX_TIMER_MINUTES = 360;
/** Reading allowances in NSW top out around ten minutes; the ceiling is generous. */
export const MAX_READING_MINUTES = 30;

export function clampDuration(seconds) {
  const bounded = Math.min(MAX_TIMER_MINUTES * 60, Math.max(MIN_TIMER_MINUTES * 60, Math.round(seconds)));
  return Number.isFinite(bounded) ? bounded : MIN_TIMER_MINUTES * 60;
}

export function clampReading(seconds) {
  const bounded = Math.min(MAX_READING_MINUTES * 60, Math.max(0, Math.round(seconds)));
  return Number.isFinite(bounded) ? bounded : 0;
}

export function createExamTimer(durationSeconds, readingSeconds = 0) {
  return {
    status: 'idle',
    durationSeconds: clampDuration(durationSeconds),
    readingSeconds: clampReading(readingSeconds),
    endsAt: null,
    pausedRemaining: null,
    startedAt: null,
  };
}

/** Blobs written before reading time existed have no field. */
function readingOf(state) {
  return Number.isFinite(state.readingSeconds) ? Math.max(0, state.readingSeconds) : 0;
}

/** Reading plus working: the wall-clock length of the whole attempt. */
export function totalSeconds(state) {
  return state.durationSeconds + readingOf(state);
}

export function startTimer(state, now) {
  if (state.status === 'running') return state;
  const remaining = state.status === 'paused' && state.pausedRemaining !== null
    ? state.pausedRemaining
    : totalSeconds(state);

  return {
    ...state,
    status: 'running',
    endsAt: now + remaining * 1000,
    pausedRemaining: null,
    startedAt: state.startedAt ?? now,
  };
}

export function pauseTimer(state, now) {
  if (state.status !== 'running' || state.endsAt === null) return state;
  return {
    ...state,
    status: 'paused',
    pausedRemaining: Math.max(0, Math.round((state.endsAt - now) / 1000)),
    endsAt: null,
  };
}

/** Reset keeps the reading allowance: it is part of how this paper is sat. */
export function resetTimer(state, durationSeconds = state.durationSeconds) {
  return createExamTimer(durationSeconds, readingOf(state));
}

/** Changing the length mid-attempt would invalidate the pacing, so idle only. */
export function setDuration(state, durationSeconds) {
  if (state.status !== 'idle') return state;
  return { ...state, durationSeconds: clampDuration(durationSeconds) };
}

export function setReadingTime(state, readingSeconds) {
  if (state.status !== 'idle') return state;
  return { ...state, readingSeconds: clampReading(readingSeconds) };
}

function remainingFor(state, now) {
  if (state.status === 'running' && state.endsAt !== null) {
    return Math.max(0, Math.round((state.endsAt - now) / 1000));
  }
  if (state.status === 'paused' && state.pausedRemaining !== null) return state.pausedRemaining;
  if (state.status === 'finished') return 0;
  return totalSeconds(state);
}

export function readTimer(state, now) {
  const total = totalSeconds(state);
  const remainingSeconds = remainingFor(state, now);
  const elapsedSeconds = Math.max(0, total - remainingSeconds);
  const progress = total > 0 ? Math.min(1, Math.max(0, elapsedSeconds / total)) : 0;

  // Reading runs first, so anything above the working allowance is still reading.
  const inReading = readingOf(state) > 0 && remainingSeconds > state.durationSeconds;

  return {
    status: remainingSeconds === 0 && state.status === 'running' ? 'finished' : state.status,
    remainingSeconds,
    phase: inReading ? 'reading' : 'working',
    phaseRemainingSeconds: inReading ? remainingSeconds - state.durationSeconds : remainingSeconds,
    elapsedSeconds,
    progress,
    // Floored, so the readout only reaches 100% when the time is actually gone.
    percentElapsed: Math.floor(progress * 100),
  };
}

function pad(value) {
  return String(value).padStart(2, '0');
}

/**
 * `MM:SS`, or `H:MM:SS` past an hour. Minutes are not zero-padded once an hour
 * shows, because `1:02:00` reads as a duration while `01:02:00` reads as a clock.
 */
export function formatClock(seconds) {
  const safe = Math.max(0, Math.round(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainder = safe % 60;

  if (hours > 0) return `${hours}:${pad(minutes)}:${pad(remainder)}`;
  return `${pad(minutes)}:${pad(remainder)}`;
}

/**
 * Alert thresholds, in seconds remaining. Chosen to match what invigilators
 * actually call in a NSW exam room, so practising builds the same instincts.
 */
export const TIMER_ALERTS = [
  { remainingSeconds: 30 * 60, label: '30 minutes remaining' },
  { remainingSeconds: 10 * 60, label: '10 minutes remaining' },
  { remainingSeconds: 5 * 60, label: '5 minutes remaining' },
  { remainingSeconds: 0, label: 'Pens down' },
];

/**
 * Which alert a tick crossed, if any. Compares readings rather than testing
 * equality, because a backgrounded tab can jump several seconds and would skip
 * an exact match entirely.
 */
export function crossedAlert(previousRemaining, currentRemaining) {
  if (currentRemaining >= previousRemaining) return null;
  return TIMER_ALERTS.find(
    (alert) => previousRemaining > alert.remainingSeconds && currentRemaining <= alert.remainingSeconds,
  ) || null;
}

/**
 * Tick marks for the dial. Labels every `labelEvery` steps, the rest plain, which
 * is what gives the dial a readable rhythm instead of a wall of numbers.
 */
export function buildDialTicks(minMinutes = MIN_TIMER_MINUTES, maxMinutes = MAX_TIMER_MINUTES, step = 1, labelEvery = 5) {
  const ticks = [];
  for (let minutes = minMinutes; minutes <= maxMinutes; minutes += step) {
    ticks.push({ minutes, labelled: minutes % labelEvery === 0 });
  }
  return ticks;
}

/** Snaps a dragged dial position onto the nearest whole minute in range. */
export function snapDialMinutes(minutes) {
  return Math.min(MAX_TIMER_MINUTES, Math.max(MIN_TIMER_MINUTES, Math.round(minutes)));
}

/**
 * A short tone at each invigilator call.
 *
 * Synthesised rather than shipped as a file: two oscillator notes, no network
 * request at the exact moment a student is mid-question, and the volume is the
 * user's own setting. A browser that blocks audio without a gesture simply does
 * nothing, which is the correct silent failure for a timer chime.
 */
export function playChime(volume = 0.6, final = false) {
  if (volume <= 0 || typeof window === 'undefined') return;

  try {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;

    const context = new AudioContextClass();
    const gain = context.createGain();
    gain.connect(context.destination);

    const notes = final ? [880, 660, 440] : [660, 880];
    notes.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = 'sine';
      oscillator.frequency.value = frequency;
      oscillator.connect(gain);
      const start = context.currentTime + index * 0.18;
      oscillator.start(start);
      oscillator.stop(start + 0.16);
    });

    // Ramped rather than switched: a square-edged gate on a sine wave clicks.
    gain.gain.setValueAtTime(0, context.currentTime);
    gain.gain.linearRampToValueAtTime(Math.min(1, volume) * 0.3, context.currentTime + 0.02);
    gain.gain.linearRampToValueAtTime(0, context.currentTime + notes.length * 0.18 + 0.16);

    setTimeout(() => context.close(), (notes.length * 0.18 + 0.4) * 1000);
  } catch (error) {
    // Audio is a courtesy; a blocked context must never interrupt the attempt.
  }
}
