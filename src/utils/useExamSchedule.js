import { useEffect, useMemo, useState } from 'react';
import {
  compareDates,
  daysBetween,
  formatExamDate,
  getTodayInSydney,
  normalizeConfig,
  parseIsoDate,
} from './examDates';
import { filterExamsForPortalSubjects } from './examSubjectMatch';

/**
 * Loads the published written-exam timetable once and hands back the exams that
 * are still ahead, annotated with the days remaining. Today and the Calendar
 * both read from here so the countdown never disagrees between screens.
 */
export function useExamSchedule(mySubjects = []) {
  const [config, setConfig] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(() => {
    let cancelled = false;

    fetch('/hsc-exam-dates.json')
      .then((response) => {
        if (!response.ok) throw new Error('Could not load the exam timetable.');
        return response.json();
      })
      .then((data) => {
        if (cancelled) return;
        setConfig(data);
        setLoadError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setLoadError(error.message);
      });

    return () => { cancelled = true; };
  }, []);

  const subjectKey = mySubjects.join('|');

  return useMemo(() => {
    const normalized = normalizeConfig(config);
    const allExams = normalized.exams || [];
    const today = getTodayInSydney();

    const withDays = allExams.map((exam) => ({
      ...exam,
      daysAway: daysBetween(today, parseIsoDate(exam.date)),
      when: formatExamDate(exam.date, exam.time, exam.endTime),
    }));

    const upcoming = withDays.filter((exam) => compareDates(parseIsoDate(exam.date), today) >= 0);
    const mine = mySubjects.length > 0
      ? filterExamsForPortalSubjects(upcoming, mySubjects)
      : upcoming;

    return {
      loadError,
      isLoaded: Boolean(config),
      today,
      allExams: withDays,
      upcoming,
      myExams: mine.length > 0 ? mine : upcoming,
      firstWritten: upcoming[0] || null,
    };
    // subjectKey stands in for the array identity, which changes on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, loadError, subjectKey]);
}
