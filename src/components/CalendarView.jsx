import { useEffect, useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Download, ExternalLink, Trash2 } from 'lucide-react';
import { ALLOWANCES, MAX_RUNG, clampRung } from '../utils/practiceLadder';
import { exportExamsToIcs } from '../utils/exportIcs';

const ASSESSMENTS_STORAGE_KEY = 'hsc_assessments';
const DAY_HEADS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const RUN_IN_WEEKS = 10;

function readAssessments() {
  try {
    const raw = localStorage.getItem(ASSESSMENTS_STORAGE_KEY);
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

function isoFor(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Monday-first weekday index for the first of a month. */
function leadingBlanks(year, monthIndex) {
  return (new Date(year, monthIndex, 1).getDay() + 6) % 7;
}

/**
 * The term as an almanac: the published written exams down the side, the month
 * as a ruled grid, and the run-in showing how the allowance tightens week by
 * week between now and the first paper.
 */
export default function CalendarView({
  exams = [],
  ladder = [],
  onAssessmentsChanged,
}) {
  // Held in state so the month grid does not rebuild on every render.
  const [today] = useState(() => new Date());
  const [cursor, setCursor] = useState(() => ({ year: today.getFullYear(), month: today.getMonth() }));
  const [assessments, setAssessments] = useState(readAssessments);
  const [draftDate, setDraftDate] = useState(null);
  const [draftSubject, setDraftSubject] = useState('');
  const [draftNote, setDraftNote] = useState('');

  useEffect(() => {
    const refresh = () => setAssessments(readAssessments());
    window.addEventListener('storage', refresh);
    return () => window.removeEventListener('storage', refresh);
  }, []);

  const persist = (next) => {
    setAssessments(next);
    try {
      localStorage.setItem(ASSESSMENTS_STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      // Storage may be unavailable; the in-memory list still updates for this visit.
    }
    onAssessmentsChanged?.(next);
  };

  const marksByDate = useMemo(() => {
    const map = new Map();
    const push = (date, entry) => {
      if (!date) return;
      if (!map.has(date)) map.set(date, []);
      map.get(date).push(entry);
    };

    exams.forEach((exam) => push(exam.date, { label: `${exam.label} · written`, kind: 'exam' }));
    assessments.forEach((entry) => push(entry.day, {
      label: [entry.subject, entry.period].filter(Boolean).join(' · ') || 'Assessment',
      kind: 'assessment',
      id: entry.id,
    }));

    return map;
  }, [exams, assessments]);

  const grid = useMemo(() => {
    const blanks = leadingBlanks(cursor.year, cursor.month);
    const daysInMonth = new Date(cursor.year, cursor.month + 1, 0).getDate();
    const cells = [];

    for (let index = 0; index < blanks; index += 1) cells.push({ key: `blank-${index}`, out: true });
    for (let day = 1; day <= daysInMonth; day += 1) {
      const iso = isoFor(cursor.year, cursor.month, day);
      cells.push({
        key: iso,
        iso,
        day,
        marks: marksByDate.get(iso) || [],
        isToday:
          day === today.getDate()
          && cursor.month === today.getMonth()
          && cursor.year === today.getFullYear(),
      });
    }
    while (cells.length % 7 !== 0) cells.push({ key: `tail-${cells.length}`, out: true });

    return cells;
  }, [cursor, marksByDate, today]);

  const runIn = useMemo(() => {
    const firstExam = exams[0];
    if (!firstExam) return [];

    const weeksAway = Math.max(1, Math.min(RUN_IN_WEEKS, Math.ceil(firstExam.daysAway / 7)));
    const averageRung = ladder.length > 0
      ? ladder.reduce((sum, entry) => sum + entry.rung, 0) / ladder.length
      : 2;
    const startRung = clampRung(averageRung);

    const columns = Array.from({ length: weeksAway }, (_, index) => {
      const progress = weeksAway === 1 ? 1 : index / (weeksAway - 1);
      const rung = clampRung(startRung + (MAX_RUNG - startRung) * progress);
      return {
        key: `w${index}`,
        week: index === 0 ? 'This wk' : `+${index}`,
        label: ALLOWANCES[rung - 1].label,
        height: 12 + rung * 6,
        now: false,
      };
    });

    columns.push({ key: 'exam', week: 'Exam', label: '—', height: 46, now: true });
    return columns;
  }, [exams, ladder]);

  const monthName = new Date(cursor.year, cursor.month, 1).toLocaleDateString('en-AU', { month: 'long', year: 'numeric' });

  const step = (direction) => setCursor((current) => {
    const next = new Date(current.year, current.month + direction, 1);
    return { year: next.getFullYear(), month: next.getMonth() };
  });

  const saveDraft = () => {
    if (!draftDate || !draftSubject.trim()) return;
    persist([...assessments, {
      id: Date.now(),
      day: draftDate,
      subject: draftSubject.trim(),
      period: draftNote.trim(),
      topics: draftNote.trim(),
      weight: '',
    }]);
    setDraftSubject('');
    setDraftNote('');
    setDraftDate(null);
  };

  return (
    <div className="calendar-grid">
      <aside className="pane-scroll" style={{ padding: '26px 28px 30px', borderRight: '1px solid var(--color-divider)' }}>
        <div className="kick">Written exams · HSC</div>
        <p className="dim" style={{ fontSize: '11.5px', margin: '6px 0 2px' }}>Days from today.</p>
        {exams.length === 0 ? (
          <p className="dim" style={{ fontSize: '12.5px', marginTop: '8px' }}>
            No published written exams ahead for your subjects.
          </p>
        ) : exams.slice(0, 8).map((exam) => (
          <div key={exam.id} className="aside-row" style={{ padding: '10px 0' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontFamily: 'var(--font-heading)', fontSize: '16.5px' }}>{exam.label}</div>
              <div className="num dim" style={{ fontSize: '11.5px' }}>{exam.when}</div>
            </div>
            <div className="countdown" aria-label={`${exam.daysAway} days away`}>
              <span className="aside-figure num" style={{ fontSize: '20px' }}>{exam.daysAway}</span>
              <span className="countdown-unit">{exam.daysAway === 1 ? 'day' : 'days'}</span>
            </div>
          </div>
        ))}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '18px' }}>
          <button
            type="button"
            className="btn btn-secondary"
            style={{ fontSize: '13px' }}
            disabled={exams.length === 0}
            onClick={() => exportExamsToIcs(exams)}
          >
            <Download size={14} />
            Export .ics
          </button>
          <a
            className="btn btn-ghost"
            href="https://educationstandards.nsw.edu.au/wps/portal/nesa/11-12/hsc/hsc-exams/hsc-timetable"
            target="_blank"
            rel="noreferrer"
            style={{ justifyContent: 'flex-start' }}
          >
            NESA timetable
            <ExternalLink size={13} />
          </a>
        </div>
      </aside>

      <div className="calendar-main pane-scroll" style={{ padding: '26px var(--gutter) 30px' }}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: '14px', gap: '12px' }}>
          <h3 style={{ margin: 0 }}>{monthName}</h3>
          <div style={{ display: 'flex', gap: '6px' }}>
            <button type="button" className="btn btn-icon btn-secondary" onClick={() => step(-1)} aria-label="Previous month">
              <ChevronLeft size={15} />
            </button>
            <button type="button" className="btn btn-icon btn-secondary" onClick={() => step(1)} aria-label="Next month">
              <ChevronRight size={15} />
            </button>
          </div>
        </div>

        <div className="almanac">
          {DAY_HEADS.map((head) => <div key={head} className="almanac-head">{head}</div>)}
          {grid.map((cell) => (
            cell.out ? (
              <div key={cell.key} className="almanac-cell out" />
            ) : (
              <button
                key={cell.key}
                type="button"
                className={`almanac-cell ${cell.isToday ? 'today' : ''}`}
                onClick={() => { setDraftDate(cell.iso); setDraftSubject(''); setDraftNote(''); }}
              >
                <div className="num" style={{ fontSize: '12px', color: cell.isToday ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-text) 45%, transparent)' }}>
                  {cell.day}
                </div>
                {cell.marks.slice(0, 3).map((mark, index) => (
                  <div key={`${cell.key}-${index}`} className={`almanac-mark ${mark.kind === 'assessment' ? 'soft' : ''}`}>
                    {mark.label}
                  </div>
                ))}
              </button>
            )
          ))}
        </div>

        {draftDate && (
          <div className="card" style={{ marginTop: '16px', borderColor: 'var(--color-text)' }}>
            <div className="card-kicker">
              {new Date(`${draftDate}T00:00:00`).toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long' })}
            </div>
            {(marksByDate.get(draftDate) || []).map((mark, index) => (
              <div key={`${draftDate}-listed-${index}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', fontSize: '13px', padding: '4px 0', borderBottom: '1px solid var(--color-divider)' }}>
                <span style={{ flex: 1 }}>{mark.label}</span>
                {mark.kind === 'assessment' && (
                  <button
                    type="button"
                    className="btn btn-ghost"
                    aria-label="Remove this entry"
                    onClick={() => persist(assessments.filter((entry) => entry.id !== mark.id))}
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </div>
            ))}
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: '12px', marginTop: '8px' }}>
              <div className="field">
                <label htmlFor="calendar-draft-subject">Subject or task</label>
                <input
                  id="calendar-draft-subject"
                  className="input"
                  value={draftSubject}
                  onChange={(event) => setDraftSubject(event.target.value)}
                  placeholder="Chemistry trial"
                />
              </div>
              <div className="field">
                <label htmlFor="calendar-draft-note">Note</label>
                <input
                  id="calendar-draft-note"
                  className="input"
                  value={draftNote}
                  onChange={(event) => setDraftNote(event.target.value)}
                  placeholder="To time, closed book"
                />
              </div>
            </div>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end', marginTop: '10px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setDraftDate(null)}>Close</button>
              <button type="button" className="btn btn-primary" onClick={saveDraft} disabled={!draftSubject.trim()}>Pencil it in</button>
            </div>
          </div>
        )}

        {runIn.length > 0 && (
          <div style={{ marginTop: '26px' }}>
            <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '12px' }}>
              <h4 style={{ margin: 0 }}>The run-in</h4>
              <span className="sec-note">Your allowance tightens week by week as confidence holds</span>
            </div>
            <div className="runin" style={{ gridTemplateColumns: `repeat(${runIn.length}, minmax(0, 1fr))` }}>
              {runIn.map((column) => (
                <div key={column.key} className={`runin-col ${column.now ? 'now' : ''}`}>
                  <div className="num dim" style={{ fontSize: '10.5px' }}>{column.week}</div>
                  <div className="runin-bar" style={{ height: `${column.height}px` }} />
                  <div className="runin-label num">{column.label}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
