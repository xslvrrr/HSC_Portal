import { useEffect, useRef, useState } from 'react';

/**
 * Keeps an element mounted long enough to animate out.
 *
 * CSS cannot animate an unmount: the moment React removes the node the exit
 * transition has nothing to run on, which is why every overlay in the portal
 * faded in and then vanished. This holds the node in the tree for the length of
 * the exit, exposing a stage the caller turns into a class name.
 *
 * Returns `{ mounted, stage }` where stage is 'entering' | 'entered' | 'exiting'.
 * A reader who has asked for reduced motion skips the wait entirely.
 *
 * @param {boolean} isOpen
 * @param {number} exitMs how long the exit animation runs
 */
export function usePresence(isOpen, exitMs = 200) {
  const [mounted, setMounted] = useState(isOpen);
  const [stage, setStage] = useState(isOpen ? 'entered' : 'exited');
  const timerRef = useRef(null);
  const frameRef = useRef(null);

  useEffect(() => {
    const reduced = typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

    if (timerRef.current) clearTimeout(timerRef.current);
    if (frameRef.current) cancelAnimationFrame(frameRef.current);

    if (isOpen) {
      setMounted(true);
      setStage('entering');
      // One frame of the entering class before switching, so the transition has
      // a starting value to run from rather than being applied on first paint.
      frameRef.current = requestAnimationFrame(() => setStage('entered'));
      return undefined;
    }

    if (!mounted) return undefined;

    if (reduced) {
      setMounted(false);
      setStage('exited');
      return undefined;
    }

    setStage('exiting');
    timerRef.current = setTimeout(() => {
      setMounted(false);
      setStage('exited');
    }, exitMs);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
    // `mounted` is deliberately not a dependency: reacting to it would restart
    // the exit timer the moment it flips and leave the node mounted forever.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, exitMs]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (frameRef.current) cancelAnimationFrame(frameRef.current);
  }, []);

  return { mounted, stage };
}
