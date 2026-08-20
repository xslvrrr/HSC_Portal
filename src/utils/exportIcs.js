function escapeIcsText(text) {
  return String(text)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function toIcsLocal(date, time) {
  const [y, m, d] = date.split('-');
  const [hh, mm] = (time || '00:00').split(':');
  return `${y}${m}${d}T${hh.padStart(2, '0')}${mm.padStart(2, '0')}00`;
}

function formatUtcStamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return (
    `${date.getUTCFullYear()}${p(date.getUTCMonth() + 1)}${p(date.getUTCDate())}` +
    `T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z`
  );
}

/**
 * @param {Array<{ id: string, label: string, date: string, time: string, endTime?: string, hscDay?: number }>} exams
 * @param {string} [calendarName]
 */
export function generateIcs(exams, calendarName = 'HSC Written Exams') {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//HSC Portal//hsc-portal',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${escapeIcsText(calendarName)}`,
  ];

  const dtstamp = formatUtcStamp();

  for (const exam of exams) {
    const endTime = exam.endTime || exam.time;
    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${exam.id}@hsc-portal`);
    lines.push(`DTSTAMP:${dtstamp}`);
    lines.push(`DTSTART;TZID=Australia/Sydney:${toIcsLocal(exam.date, exam.time)}`);
    lines.push(`DTEND;TZID=Australia/Sydney:${toIcsLocal(exam.date, endTime)}`);
    lines.push(`SUMMARY:${escapeIcsText(exam.label)}`);
    const desc = exam.hscDay != null ? `HSC Day ${exam.hscDay} · NSW written examination` : 'NSW HSC written examination';
    lines.push(`DESCRIPTION:${escapeIcsText(desc)}`);
    lines.push(`LOCATION:${escapeIcsText('NSW HSC Written Examination')}`);
    lines.push('END:VEVENT');
  }

  lines.push('END:VCALENDAR');
  return `${lines.join('\r\n')}\r\n`;
}

/**
 * @param {string} filename
 * @param {string} icsContent
 */
export function downloadIcsFile(filename, icsContent) {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * @param {Array<{ id: string, label: string, date: string, time: string, endTime?: string, hscDay?: number }>} exams
 * @param {{ calendarName?: string, filename?: string, year?: number }} [options]
 */
export function exportExamsToIcs(exams, options = {}) {
  if (!exams.length) return false;

  const year = options.year ?? new Date().getFullYear();
  const calendarName = options.calendarName ?? `HSC ${year} Written Exams`;
  const filename = options.filename ?? `hsc-exams-${year}.ics`;
  const ics = generateIcs(exams, calendarName);
  downloadIcsFile(filename, ics);
  return true;
}
