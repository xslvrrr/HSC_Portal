import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, Pause, Play, RotateCcw } from 'lucide-react';
import RollingDigits from './RollingDigits';
import {
  MAX_TIMER_MINUTES,
  MIN_TIMER_MINUTES,
  buildDialTicks,
  crossedAlert,
  formatClock,
  pauseTimer,
  playChime,
  readTimer,
  resetTimer,
  setDuration,
  setReadingTime,
  snapDialMinutes,
  startTimer,
} from '../../utils/examTimer';

/** Pixels between adjacent minute ticks. The dial is dragged in these units. */
const TICK_SPACING_PX = 9;

function prefersReducedMotion() {
  return typeof window !== 'undefined'
    && Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
}

/**
 * Carries the frame between the timer's two shapes.
 *
 * The setup strip and the running bar are different components with different
 * sizes, and React swaps one for the other in a single commit — so without this
 * the frame jumps from tall to short with no motion at all, which is exactly the
 * snap the Millennium reader animated away. Millennium used a layout animation;
 * here the measured size of whichever shape is mounted is written onto the outer
 * frame, and the frame transitions between the two.
 *
 * The first measurement is applied with the transition suppressed, so the timer
 * does not unfold from nothing when the room opens.
 */
function useShapeMorph(shapeKey) {
  const shellRef = useRef(null);
  const innerRef = useRef(null);
  const primedRef = useRef(false);

  useLayoutEffect(() => {
    const shell = shellRef.current;
    const inner = innerRef.current;
    if (!shell || !inner) return undefined;

    const sync = () => {
      const width = `${inner.offsetWidth}px`;
      const height = `${inner.offsetHeight}px`;
      if (shell.style.width === width && shell.style.height === height) return;

      if (!primedRef.current || prefersReducedMotion()) {
        shell.style.transition = 'none';
        shell.style.width = width;
        shell.style.height = height;
        // Read back so the suppressed transition applies to this value rather
        // than being batched away with the one that follows it.
        void shell.offsetWidth;
        shell.style.transition = '';
        primedRef.current = true;
        return;
      }

      shell.style.width = width;
      shell.style.height = height;
    };

    sync();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(sync);
    observer.observe(inner);
    return () => observer.disconnect();
  }, [shapeKey]);

  return { shellRef, innerRef };
}

const SOURCE_LABELS = {
  document: 'Read from the paper',
  ladder: 'Set by your ladder allowance',
  'subject-default': 'Official time for this course',
  manual: null,
  unknown: null,
};

/**
 * The minute dial.
 *
 * A horizontal rule of ticks that slides under a fixed centre pointer, so
 * setting a length is a drag rather than a number field — the common action is
 * nudging a suggested time by a few minutes, not typing one from scratch.
 *
 * The strip is moved by a transform on a ref rather than re-rendered per frame,
 * so it follows the pointer continuously instead of jumping tick to tick, and
 * settles onto the nearest whole minute when the drag ends.
 */
function MinuteDial({ minutes, onChange }) {
  const stripRef = useRef(null);
  const dragRef = useRef(null);
  /** The dial's own position, in fractional minutes. Whole minutes leave here. */
  const valueRef = useRef(minutes);

  const ticks = useMemo(() => buildDialTicks(MIN_TIMER_MINUTES, MAX_TIMER_MINUTES, 1, 5), []);

  const paint = useCallback((value, glide) => {
    const strip = stripRef.current;
    if (!strip) return;
    strip.style.transition = glide ? 'transform 0.32s cubic-bezier(0.22, 1, 0.36, 1)' : 'none';
    strip.style.transform = `translateX(${-(value - MIN_TIMER_MINUTES) * TICK_SPACING_PX}px)`;
  }, []);

  const moveTo = useCallback((next, glide) => {
    const clamped = Math.min(MAX_TIMER_MINUTES, Math.max(MIN_TIMER_MINUTES, next));
    valueRef.current = clamped;
    paint(clamped, glide);
  }, [paint]);

  // Follows the value when it changes anywhere but here — the ladder's allowance
  // arriving, or a reset. Skipped mid-drag, where the pointer is the authority.
  useEffect(() => {
    if (dragRef.current) return;
    if (Math.round(valueRef.current) === minutes) {
      paint(minutes, false);
      return;
    }
    moveTo(minutes, true);
  }, [minutes, moveTo, paint]);

  const step = (delta) => {
    const next = snapDialMinutes(Math.round(valueRef.current) + delta);
    moveTo(next, true);
    if (next !== minutes) onChange(next);
  };

  return (
    <div
      className="dial"
      role="slider"
      tabIndex={0}
      aria-label="Working time in minutes"
      aria-valuemin={MIN_TIMER_MINUTES}
      aria-valuemax={MAX_TIMER_MINUTES}
      aria-valuenow={minutes}
      aria-valuetext={`${minutes} minutes`}
      onPointerDown={(event) => {
        event.currentTarget.setPointerCapture(event.pointerId);
        dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startMinutes: valueRef.current };
      }}
      onPointerMove={(event) => {
        const drag = dragRef.current;
        if (!drag || drag.pointerId !== event.pointerId) return;
        // Dragging left advances the dial, matching a wheel turning under the pointer.
        moveTo(drag.startMinutes - (event.clientX - drag.startX) / TICK_SPACING_PX, false);
        const rounded = snapDialMinutes(valueRef.current);
        if (rounded !== minutes) onChange(rounded);
      }}
      onPointerUp={(event) => {
        if (dragRef.current?.pointerId !== event.pointerId) return;
        dragRef.current = null;
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        const settled = snapDialMinutes(valueRef.current);
        moveTo(settled, true);
        if (settled !== minutes) onChange(settled);
      }}
      onPointerCancel={() => { dragRef.current = null; }}
      onKeyDown={(event) => {
        const size = event.shiftKey ? 5 : 1;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); step(size); }
        if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); step(-size); }
      }}
      onWheel={(event) => step(Math.sign(event.deltaY))}
    >
      <div className="dial-strip" ref={stripRef} aria-hidden="true">
        {ticks.map((tick) => (
          <div
            key={tick.minutes}
            className={`dial-tick ${tick.labelled ? 'labelled' : ''}`}
            style={{ left: (tick.minutes - MIN_TIMER_MINUTES) * TICK_SPACING_PX }}
          >
            {tick.labelled && <span className="dial-tick-label num">{tick.minutes}</span>}
            <span className="dial-tick-mark" />
          </div>
        ))}
      </div>
      <div className="dial-pointer" aria-hidden="true" />
    </div>
  );
}

/**
 * The exam timer.
 *
 * Two shapes, one component, ported from the Millennium reader. Before it starts
 * it is a tall strip: a minute dial you drag to set the length, a start control,
 * and the time you are about to sit. Once running it collapses to the height of
 * the toolbar beside it — the setup affordance has done its job and the paper is
 * what matters — leaving the clock, a rule that fills across the attempt, and
 * the share of the time already gone.
 *
 * Where the paper grants reading time, that runs as its own phase before the
 * working clock rather than being folded into it.
 */
export default function ExamTimerBar({
  state,
  onStateChange,
  durationSource = 'manual',
  sourceDetail = null,
  suggestedReadingMinutes = 0,
  volume = 0.6,
  onFinished,
}) {
  const [now, setNow] = useState(() => Date.now());
  const previousRemainingRef = useRef(null);
  const previousPhaseRef = useRef(null);
  const finishedRef = useRef(false);

  const reading = readTimer(state, now);
  const running = state.status === 'running';
  const expanded = state.status === 'idle';
  const { shellRef, innerRef } = useShapeMorph(expanded ? 'setup' : 'running');

  // Ticking at 250ms rather than 1s: a 1s interval drifts against the wall clock
  // and the seconds digit visibly stutters roughly once a minute.
  useEffect(() => {
    if (!running) return undefined;
    const interval = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(interval);
  }, [running]);

  useEffect(() => {
    const previous = previousRemainingRef.current;
    const previousPhase = previousPhaseRef.current;
    previousRemainingRef.current = reading.remainingSeconds;
    previousPhaseRef.current = reading.phase;
    if (previous === null || !running) return;

    const alert = crossedAlert(previous, reading.remainingSeconds);
    if (alert) playChime(volume, alert.remainingSeconds === 0);
    // The end of reading time is called in a real exam room too, and it is the
    // moment writing is allowed to start — it earns its own tone.
    else if (previousPhase === 'reading' && reading.phase === 'working') playChime(volume, false);

    if (reading.remainingSeconds === 0 && !finishedRef.current) {
      finishedRef.current = true;
      onFinished?.(state);
    }
  }, [onFinished, reading.phase, reading.remainingSeconds, running, state, volume]);

  useEffect(() => {
    if (state.status === 'idle') finishedRef.current = false;
  }, [state.status]);

  const handleReset = () => {
    // Re-read on the same frame, so the clock goes from where it was to the full
    // allowance instead of passing through a stale value first.
    previousRemainingRef.current = null;
    previousPhaseRef.current = null;
    setNow(Date.now());
    onStateChange(resetTimer(state));
  };

  const clock = formatClock(reading.phaseRemainingSeconds);
  const inReading = reading.phase === 'reading';
  const minutes = Math.round(state.durationSeconds / 60);
  const readingMinutes = Math.round(state.readingSeconds / 60);
  const readingOn = readingMinutes > 0;
  // A paper with no stated allowance still gets the standard NSW five minutes on
  // offer, because a student sitting it in exam conditions will be given reading time.
  const offeredReading = suggestedReadingMinutes > 0 ? suggestedReadingMinutes : 5;
  // A detected time the student cannot verify is a time they will not trust, so
  // the label says exactly what was read out of the paper.
  const sourceLabel = sourceDetail || SOURCE_LABELS[durationSource];

  const urgency = reading.remainingSeconds === 0
    ? 'over'
    : reading.remainingSeconds <= 300
      ? 'close'
      : '';

  return (
    <div className="exam-timer-shell" ref={shellRef} role="group" aria-label="Exam timer">
      {expanded ? (
        <div className="exam-timer is-setup" key="setup" ref={innerRef}>
          <MinuteDial minutes={minutes} onChange={(next) => onStateChange(setDuration(state, next * 60))} />

          <div className="exam-timer-setup-foot">
            <div className="exam-timer-setup-actions">
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => { setNow(Date.now()); onStateChange(startTimer(state, Date.now())); }}
              >
                Start the clock
              </button>
              <button
                type="button"
                className={`btn ${readingOn ? 'btn-primary' : 'btn-secondary'}`}
                aria-pressed={readingOn}
                onClick={() => onStateChange(setReadingTime(state, readingOn ? 0 : offeredReading * 60))}
              >
                <BookOpen size={14} />
                {readingOn ? `${readingMinutes} min reading` : `Add ${offeredReading} min reading`}
              </button>
              {sourceLabel && <span className="dim" style={{ fontSize: '11px' }}>{sourceLabel}</span>}
            </div>

            <div className="exam-timer-setup-readout">
              <RollingDigits
                className="exam-clock num"
                value={formatClock(minutes * 60)}
                label={`${formatClock(minutes * 60)} of working time selected`}
              />
              {readingOn && <span className="dim" style={{ fontSize: '11px' }}>after {readingMinutes} min reading</span>}
            </div>
          </div>
        </div>
      ) : (
        <div className={`exam-timer is-running ${urgency}`} key="running" ref={innerRef}>
          {inReading && (
            <span className="exam-phase">
              <BookOpen size={13} />
              Reading
            </span>
          )}

          <RollingDigits
            className="exam-clock num"
            value={clock}
            label={inReading ? `${clock} of reading time remaining` : `${clock} remaining`}
          />

          <div
            className="exam-progress"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={reading.percentElapsed}
            aria-label="Time elapsed"
          >
            <i style={{ width: `${reading.progress * 100}%` }} />
          </div>
          <span className="num dim exam-percent">{reading.percentElapsed}%</span>

          <button
            type="button"
            className="tool-btn"
            title={running ? 'Pause' : 'Resume'}
            aria-label={running ? 'Pause' : 'Resume'}
            onClick={() => onStateChange(running ? pauseTimer(state, Date.now()) : startTimer(state, Date.now()))}
          >
            {running ? <Pause size={15} /> : <Play size={15} />}
          </button>
          <button type="button" className="tool-btn" title="Reset" aria-label="Reset" onClick={handleReset}>
            <RotateCcw size={15} />
          </button>
        </div>
      )}
    </div>
  );
}
