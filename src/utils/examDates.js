import { filterExamsForPortalSubject, filterExamsForPortalSubjects } from './examSubjectMatch';

const SYDNEY_TZ = 'Australia/Sydney';

/** @returns {{ y: number, m: number, d: number }} */
export function getTodayInSydney(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);

  const get = (type) => parts.find((p) => p.type === type)?.value ?? '0';
  return {
    y: Number(get('year')),
    m: Number(get('month')),
    d: Number(get('day')),
  };
}

export function parseIsoDate(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return { y, m, d };
}

export function daysBetween(from, to) {
  const a = Date.UTC(from.y, from.m - 1, from.d);
  const b = Date.UTC(to.y, to.m - 1, to.d);
  return Math.round((b - a) / 86400000);
}

export function compareDates(a, b) {
  if (a.y !== b.y) return a.y - b.y;
  if (a.m !== b.m) return a.m - b.m;
  return a.d - b.d;
}

function slugify(subject) {
  return subject
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 96);
}

/** Sydney local exam start as UTC milliseconds. */
export function getSydneyExamTimestamp(date, time) {
  const [y, m, d] = date.split('-').map(Number);
  const [hour, minute] = time.split(':').map(Number);

  let t = Date.UTC(y, m - 1, d, hour, minute, 0);

  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: SYDNEY_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const read = (ms) => {
    const parts = fmt.formatToParts(new Date(ms));
    const g = (type) => parseInt(parts.find((p) => p.type === type)?.value ?? '0', 10);
    return { y: g('year'), m: g('month'), d: g('day'), h: g('hour'), min: g('minute') };
  };

  for (let i = 0; i < 6; i++) {
    const got = read(t);
    const delta =
      (hour - got.h) * 3_600_000 +
      (minute - got.min) * 60_000 +
      (d - got.d) * 86_400_000;
    if (delta === 0 && got.y === y && got.m === m) return t;
    t += delta;
  }

  return t;
}

/** @param {number} ms */
export function splitCountdown(ms) {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return { days, hours, minutes, seconds, totalSeconds };
}

export function flattenSchedule(schedule) {
  const exams = [];

  for (const day of schedule) {
    for (const exam of day.exams) {
      exams.push({
        id: `${day.date}-${slugify(exam.subject)}`,
        label: exam.subject,
        date: day.date,
        day: day.day,
        hscDay: day.hscDay,
        time: exam.startTime,
        endTime: exam.endTime,
      });
    }
  }

  return exams.sort((a, b) => {
    const byDate = compareDates(parseIsoDate(a.date), parseIsoDate(b.date));
    if (byDate !== 0) return byDate;
    return (a.time || '').localeCompare(b.time || '');
  });
}

export function normalizeConfig(config) {
  if (!config) return { exams: [] };
  if (config.exams?.length) return config;
  if (!config.schedule?.length) return { ...config, exams: [] };

  const exams = flattenSchedule(config.schedule);
  if (exams.length > 0) {
    exams[0].firstWritten = true;
    exams[exams.length - 1].lastWritten = true;
  }

  return { ...config, exams };
}

export function formatExamDate(iso, time, endTime) {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const datePart = new Intl.DateTimeFormat('en-AU', {
    timeZone: SYDNEY_TZ,
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(dt);

  if (!time) return datePart;
  const timePart = endTime ? `${time}–${endTime}` : time;
  return `${datePart} · ${timePart}`;
}

function getUpcomingByTime(exams, now = new Date()) {
  const nowMs = now.getTime();
  return exams
    .map((exam) => ({
      exam,
      startMs: getSydneyExamTimestamp(exam.date, exam.time),
    }))
    .filter(({ startMs }) => startMs > nowMs)
    .sort((a, b) => a.startMs - b.startMs)
    .map(({ exam }) => exam);
}

/**
 * @param {object} rawConfig
 * @param {{ subjectName?: string|null }} [options]
 * @param {Date} [now]
 */
export function getNextExamState(rawConfig, options = {}, now = new Date()) {
  const { subjectName = null, pinnedSubjectNames = null } = options;
  const config = normalizeConfig(rawConfig);

  if (!config.exams?.length) {
    return { status: 'unavailable' };
  }

  let pool = config.exams;
  let mode = 'global';

  if (subjectName) {
    pool = filterExamsForPortalSubject(config.exams, subjectName);
    mode = 'subject';
  } else if (pinnedSubjectNames?.length) {
    pool = filterExamsForPortalSubjects(config.exams, pinnedSubjectNames);
    mode = 'pinned';
  }

  if (subjectName && pool.length === 0) {
    return { status: 'no-subject-exams', subjectName, year: config.year };
  }

  if (mode === 'pinned' && pool.length === 0) {
    return {
      status: 'no-subject-exams',
      pinnedSubjectNames,
      year: config.year,
    };
  }

  const upcoming = getUpcomingByTime(pool, now);

  if (upcoming.length === 0) {
    return {
      status: 'finished',
      year: config.year,
      period: config.period,
      subjectName,
      pinnedSubjectNames: mode === 'pinned' ? pinnedSubjectNames : null,
      mode,
    };
  }

  const target = upcoming[0];
  const nextUp = upcoming[1] ?? null;
  const remainingMs = Math.max(0, getSydneyExamTimestamp(target.date, target.time) - now.getTime());

  return {
    status: 'active',
    year: config.year,
    remainingMs,
    countdown: splitCountdown(remainingMs),
    target,
    nextUp,
    upcomingInScope: upcoming.slice(0, 6),
    period: config.period,
    nesaUrl: config.nesaUrl,
    nesaPdfUrl: config.nesaPdfUrl,
    subjectName,
    pinnedSubjectNames: mode === 'pinned' ? pinnedSubjectNames : null,
    mode,
  };
}

/** @deprecated Use getNextExamState */
export function getCountdownState(rawConfig, now = new Date()) {
  return getNextExamState(rawConfig, {}, now);
}
