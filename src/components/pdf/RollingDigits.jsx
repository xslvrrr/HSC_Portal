import { Fragment } from 'react';

const DIGITS = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'];

/**
 * A clock whose digits roll when they change.
 *
 * Ported from the Millennium reader, with the spring rewritten as a CSS
 * transition — the portal carries no animation library and one clock is not
 * worth one.
 *
 * Each digit is a full 0–9 column translated to the right row, so only the
 * digits that actually changed move: a seconds tick rolls one column, and the
 * minute rolls two at the turn. Animating the whole string instead would make
 * the entire clock twitch every second, which is exactly the kind of motion
 * that pulls a reader's eye off the paper they are supposed to be sitting.
 *
 * The columns are hidden from screen readers and the value is announced once as
 * text, because a reader walking ten digits per column produces noise rather
 * than a time.
 */
export default function RollingDigits({ value, animated = true, className = '', label }) {
  const text = String(value ?? '');

  return (
    <span className={`roll ${className}`.trim()} role="timer">
      <span className="sr-only">{label ?? text}</span>
      <span className="roll-row" aria-hidden="true">
        {/*
          Keyed by position counted from the right.

          Keyed by character, every tick produces a new key, so React unmounts
          the old column and mounts a new one already translated to the new
          digit: the transition never runs and the clock snaps instead of
          rolling. Counting from the right keeps the seconds and minutes columns
          across the one point where the string changes length — 1:00:00 to
          59:59 drops the hours, and left-counted keys would shift every
          remaining column onto a neighbour's identity and roll the whole clock.
        */}
        {text.split('').map((character, index) => (
          <Fragment key={text.length - index}>
            {DIGITS.includes(character) ? (
              <span className="roll-digit">
                <span
                  className={`roll-column ${animated ? '' : 'is-still'}`}
                  // A percentage translate resolves against the column's own
                  // height, and the column is all ten digits tall — so one digit
                  // is 10%, not 100%.
                  style={{ transform: `translateY(${-Number(character) * 10}%)` }}
                >
                  {DIGITS.map((candidate) => <span key={candidate}>{candidate}</span>)}
                </span>
              </span>
            ) : (
              <span className="roll-separator">{character}</span>
            )}
          </Fragment>
        ))}
      </span>
    </span>
  );
}
