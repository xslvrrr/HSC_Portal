import { useEffect, useMemo, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  FlaskConical,
  Leaf,
  Orbit,
  Sigma,
} from 'lucide-react';
import {
  ALLOWANCES,
  MAX_RUNG,
  buildLadder,
  buildWeakSpots,
  chooseNextSubject,
  describeHeadline,
  describePrescription,
} from '../utils/practiceLadder';
import { EMPTY_WEAK_SPOTS, WEAK_SPOT_NOTE, daySeed, pick } from '../utils/copyPool';
import { getPaperIdentity } from '../utils/paperIdentity';

const LADDER_COLUMNS = '26px minmax(0, 1fr) 128px 96px 116px 78px';

const SUBJECT_ICONS = [
  { match: /chem/i, Icon: FlaskConical },
  { match: /math|extension/i, Icon: Sigma },
  { match: /bio|earth|agric/i, Icon: Leaf },
  { match: /phys|astro|engineer/i, Icon: Orbit },
];

function subjectIcon(name) {
  const entry = SUBJECT_ICONS.find(({ match }) => match.test(name || ''));
  return entry ? entry.Icon : BookOpen;
}

function Rungs({ level }) {
  return (
    <span className="rung" aria-label={`Rung ${level} of ${MAX_RUNG}`}>
      {Array.from({ length: MAX_RUNG }, (_, index) => (
        <i key={index} className={index < level ? 'f' : ''} />
      ))}
    </span>
  );
}

/** The countdown in weeks, because a term is planned in weeks, not in days. */
function weeksAway(days) {
  if (days <= 0) return 'today';
  if (days < 7) return 'this week';
  const weeks = Math.round(days / 7);
  return `~${weeks} week${weeks === 1 ? '' : 's'}`;
}

function formatLastSitting(entry) {
  if (!entry.lastAt) return '—';
  const when = new Date(entry.lastAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  return entry.lastPercent === null ? when : `${when} · ${entry.lastPercent}%`;
}

/**
 * Chooses the paper the ladder prescribes: a paper in the chosen subject that
 * has not been sat yet, newest first, preferring papers that ship solutions.
 */
function choosePrescribedPaper({ papers, subjects, selectedLevel, subjectName, satPaperIds }) {
  if (!subjectName) return null;
  const subjectIndex = subjects.indexOf(subjectName);
  if (subjectIndex === -1) return null;

  const candidates = papers.filter((paper) => (
    paper.s === subjectIndex
    && paper.l === selectedLevel
    && !satPaperIds.has(getPaperIdentity(paper))
  ));

  if (candidates.length === 0) return null;

  return [...candidates].sort((left, right) => {
    const solutionDelta = (right.w === 1 ? 1 : 0) - (left.w === 1 ? 1 : 0);
    if (solutionDelta !== 0) return solutionDelta;
    return (parseInt(String(right.y), 10) || 0) - (parseInt(String(left.y), 10) || 0);
  })[0];
}

export default function TodayView({
  papers = [],
  subjects = [],
  schools = [],
  mySubjects = [],
  reviews = [],
  mistakes = [],
  exams = [],
  selectedLevel = 12,
  satPaperIds = new Set(),
  showPrescription = true,
  onBeginSitting,
  onOpenSubject,
  onGoLibrary,
  onGoNotebook,
  onInstall,
}) {
  const ladder = useMemo(
    () => buildLadder({ subjects: mySubjects, reviews }),
    [mySubjects, reviews],
  );
  const prescription = useMemo(() => chooseNextSubject(ladder), [ladder]);
  const weakSpots = useMemo(() => buildWeakSpots(mistakes), [mistakes]);

  const prescribedPaper = useMemo(() => choosePrescribedPaper({
    papers,
    subjects,
    selectedLevel,
    subjectName: prescription?.subject,
    satPaperIds,
  }), [papers, subjects, selectedLevel, prescription, satPaperIds]);

  // The segmented control starts on whatever the ladder earns, and follows it
  // whenever the prescribed subject changes, until the student overrides it.
  const defaultAllowance = prescription?.allowance?.id || 'toTime';
  const [allowanceId, setAllowanceId] = useState(null);
  const activeAllowance = allowanceId || defaultAllowance;

  useEffect(() => { setAllowanceId(null); }, [prescription?.subject, defaultAllowance]);

  // Wording is drawn from a pool, seeded by the day, rather than generated.
  const seed = daySeed();
  const headline = describeHeadline(prescription, seed);
  const nextThree = exams.slice(0, 3);

  return (
    <div className="portal-split">
      <div className="portal-main pane-scroll">
        <div className="kick">Prescribed for today</div>
        <h1 className="display">{headline}</h1>
        <p className="lede">{describePrescription(prescription, seed)}</p>

        {!showPrescription ? (
          <div className="card" style={{ borderColor: 'var(--color-text)' }}>
            <div className="card-kicker">Prescription hidden</div>
            <p className="card-body" style={{ marginTop: '4px' }}>
              You have turned the prescribed sitting off in customisation. The ladder below still tracks your form.
            </p>
            <button type="button" className="btn btn-secondary btn-block" onClick={onGoLibrary}>
              Open the library
              <ArrowRight size={14} />
            </button>
          </div>
        ) : prescribedPaper ? (
          <div className="card" style={{ gap: 'var(--space-3)', borderColor: 'var(--color-text)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '18px', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0 }}>
                <div className="card-kicker">
                  {prescribedPaper.c === 'H' ? 'Official HSC' : prescribedPaper.c === 'A' ? 'Assessment task' : 'School trial'}
                  {prescribedPaper.w === 1 ? ' · Solutions included' : ''}
                </div>
                <div style={{ fontFamily: 'var(--font-heading)', fontSize: '27px', lineHeight: 1.15, marginTop: '4px' }}>
                  {schools[prescribedPaper.h] || 'Past paper'} {prescribedPaper.y} — {subjects[prescribedPaper.s]}
                </div>
                <div className="num dim" style={{ fontSize: '12.5px', marginTop: '6px' }}>
                  {selectedLevel === 12 ? 'Year 12' : 'Year 11'} · {prescribedPaper.n}
                </div>
              </div>
              <div style={{ textAlign: 'right', flex: 'none' }}>
                <div className="kick">Rung {prescription.rung} of {MAX_RUNG}</div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '6px' }}>
                  <Rungs level={prescription.rung} />
                </div>
              </div>
            </div>

            <hr className="hr" style={{ margin: 'var(--space-2) 0' }} />

            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
              <span className="dim" style={{ fontSize: '12px' }}>Time allowance</span>
              <div className="seg">
                {ALLOWANCES.map((allowance) => (
                  <label key={allowance.id} className="seg-opt">
                    <input
                      type="radio"
                      name="today-allowance"
                      checked={activeAllowance === allowance.id}
                      onChange={() => setAllowanceId(allowance.id)}
                    />
                    <span>{allowance.label}</span>
                  </label>
                ))}
              </div>
              <span className="dim" style={{ fontSize: '12px', marginLeft: 'auto' }}>
                {prescription.rung >= 4 ? 'Closed book' : 'Open book'}
              </span>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => onBeginSitting?.(prescribedPaper, activeAllowance)}
              >
                Begin sitting
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        ) : (
          <div className="card" style={{ borderColor: 'var(--color-text)' }}>
            <div className="card-kicker">Nothing prescribed</div>
            <p className="card-body" style={{ marginTop: '4px' }}>
              {mySubjects.length === 0
                ? 'Add the subjects you study and the ladder will prescribe a paper each day.'
                : 'You have sat every paper this portal holds for that subject. Pick another from the library.'}
            </p>
            <button type="button" className="btn btn-secondary btn-block" onClick={onGoLibrary}>
              Open the library
              <ArrowRight size={14} />
            </button>
          </div>
        )}

        <div className="sec-head">
          <h4>Your ladder</h4>
          <span className="sec-note">Confidence sets the time allowance. Sit a paper to move a rung.</span>
        </div>

        <div className="idxrow h" style={{ gridTemplateColumns: LADDER_COLUMNS }}>
          <span />
          <span>Subject</span>
          <span className="hide-narrow">Confidence</span>
          <span className="hide-narrow">Allowance</span>
          <span className="hide-narrow">Last</span>
          <span />
        </div>

        {ladder.length === 0 ? (
          <p className="dim" style={{ fontSize: '13px', padding: '14px 0' }}>
            No subjects chosen yet. Open the calendar to pick the subjects you study.
          </p>
        ) : ladder.map((entry) => {
          const Icon = subjectIcon(entry.subject);
          return (
            <div
              key={entry.subject}
              className="idxrow"
              style={{ gridTemplateColumns: LADDER_COLUMNS }}
              onClick={() => onOpenSubject?.(entry.subject)}
              role="button"
              tabIndex={0}
              onKeyDown={(event) => { if (event.key === 'Enter') onOpenSubject?.(entry.subject); }}
            >
              <span style={{ color: 'var(--color-accent)', display: 'flex' }}><Icon size={15} /></span>
              <span className="idxrow-title" style={{ fontSize: '16px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {entry.subject}
              </span>
              <span className="hide-narrow"><Rungs level={entry.rung} /></span>
              <span className="num hide-narrow" style={{ fontSize: '13px' }}>{entry.allowance.label}</span>
              <span className="num dim hide-narrow" style={{ fontSize: '13px', whiteSpace: 'nowrap' }}>{formatLastSitting(entry)}</span>
              <span style={{ textAlign: 'right', fontSize: '12.5px', color: 'var(--color-accent-700)' }}>Sit next</span>
            </div>
          );
        })}
      </div>

      <aside className="portal-aside pane-scroll">
        <div className="kick">Your next written exams</div>
        {nextThree.length === 0 ? (
          <p className="dim" style={{ fontSize: '12.5px', marginTop: '8px' }}>
            The written timetable has not been published for your subjects yet.
          </p>
        ) : (
          <>
            <p className="dim" style={{ fontSize: '12.5px', margin: '6px 0 4px' }}>
              Counting down the days from today.
            </p>
            {nextThree.map((exam) => (
              <div key={exam.id} className="aside-row exam-row">
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--font-heading)', fontSize: '18px' }}>{exam.label}</div>
                  <div className="num dim" style={{ fontSize: '12px' }}>{exam.when}</div>
                </div>
                <div className="countdown" aria-label={`${exam.daysAway} days away`}>
                  <span className="aside-figure num">{exam.daysAway}</span>
                  <span className="countdown-unit">{exam.daysAway === 1 ? 'day' : 'days'}</span>
                  <span className="countdown-week">{weeksAway(exam.daysAway)}</span>
                </div>
              </div>
            ))}
          </>
        )}

        <div className="kick" style={{ marginTop: '26px' }}>Weak spots worth an hour</div>
        <p className="dim" style={{ fontSize: '12.5px', margin: '6px 0 10px' }}>
          {pick(WEAK_SPOT_NOTE, seed)}
        </p>

        {weakSpots.length === 0 ? (
          <p className="dim" style={{ fontSize: '12.5px' }}>
            {pick(EMPTY_WEAK_SPOTS, seed)}
          </p>
        ) : weakSpots.map((spot) => (
          <div key={`${spot.subject}-${spot.topic}`} className="aside-row" style={{ padding: '7px 0' }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '13.5px' }}>{spot.topic}</div>
              <div className="dim" style={{ fontSize: '11.5px' }}>{spot.subject || 'Unassigned'}</div>
            </div>
            <div style={{ textAlign: 'right', flex: 'none' }}>
              <div className="num" style={{ fontSize: '12px', color: 'var(--color-accent-700)' }}>
                {spot.count} wrong
              </div>
              <button
                type="button"
                className="btn btn-ghost"
                style={{ fontSize: '11.5px', padding: 0 }}
                onClick={() => onGoNotebook?.(spot)}
              >
                Drill
              </button>
            </div>
          </div>
        ))}

        <button type="button" className="btn btn-secondary btn-block" style={{ marginTop: '16px' }} onClick={onGoNotebook}>
          Open the notebook
          <ArrowRight size={14} />
        </button>

        {onInstall && (
          <button
            type="button"
            className="btn btn-ghost"
            style={{ marginTop: '10px', fontSize: '12px', padding: 0 }}
            onClick={onInstall}
          >
            Install to the home screen
          </button>
        )}
      </aside>
    </div>
  );
}
