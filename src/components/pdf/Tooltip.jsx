import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

/** Gap between the button and the tip, in pixels. */
const OFFSET_PX = 8;
/** Closest the tip is allowed to come to the edge of the window. */
const EDGE_PX = 8;

/**
 * A tooltip that reads like the rest of the portal.
 *
 * The native `title` attribute waits a second, renders in the operating
 * system's font, and cannot be styled — on a toolbar of eight icons that is the
 * difference between a bar you can learn and one you have to guess at. This
 * shows on hover and on keyboard focus, and stays announced to screen readers
 * through `aria-describedby`.
 *
 * The tip is drawn into a portal on `document.body` rather than beside its
 * button. Positioned inside the toolbar it was a child of `.tool-ink`, which
 * clips its own contents so the ink group can collapse — so every swatch and
 * weight tooltip was cut off at the group's edge. Nothing on the body clips it,
 * and a tip that would run off the window is nudged back with the arrow left
 * pointing at the button.
 */
export default function Tooltip({ label, hint, placement = 'top', children }) {
  const anchorRef = useRef(null);
  const tipRef = useRef(null);
  const [anchorRect, setAnchorRect] = useState(null);
  const [shown, setShown] = useState(false);
  const [shift, setShift] = useState(0);
  const id = useId();

  const open = useCallback(() => {
    const node = anchorRef.current;
    if (node) setAnchorRect(node.getBoundingClientRect());
  }, []);

  const close = useCallback(() => {
    setAnchorRect(null);
    setShown(false);
    setShift(0);
  }, []);

  // One frame in the entering state, so the transition has a value to run from
  // rather than being applied on first paint.
  useLayoutEffect(() => {
    if (!anchorRect) return undefined;
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [anchorRect]);

  // Nudged back inside the window once its real width is known.
  useLayoutEffect(() => {
    const tip = tipRef.current;
    if (!anchorRect || !tip) return;
    const box = tip.getBoundingClientRect();
    const overRight = box.right - (window.innerWidth - EDGE_PX);
    const overLeft = EDGE_PX - box.left;
    if (overRight > 0) setShift((current) => current - overRight);
    else if (overLeft > 0) setShift((current) => current + overLeft);
  }, [anchorRect]);

  // The rect is measured once, so anything that moves the button under it has
  // to take the tip with it. Dismissing is honest and cheaper than tracking.
  useEffect(() => {
    if (!anchorRect) return undefined;
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
    };
  }, [anchorRect, close]);

  const isBottom = placement === 'bottom';
  const style = anchorRect
    ? {
      left: `${anchorRect.left + anchorRect.width / 2}px`,
      top: isBottom
        ? `${anchorRect.bottom + OFFSET_PX}px`
        : `${anchorRect.top - OFFSET_PX}px`,
      '--tip-shift': `${shift}px`,
    }
    : null;

  return (
    <span
      ref={anchorRef}
      className="tip-anchor"
      onPointerEnter={open}
      onPointerLeave={close}
      onFocusCapture={open}
      onBlurCapture={close}
      // A tooltip must not survive the click that dismisses the thing it describes.
      onClickCapture={close}
    >
      {children(id)}
      {anchorRect && typeof document !== 'undefined' && createPortal(
        <span
          ref={tipRef}
          role="tooltip"
          id={id}
          className={`tip tip-${isBottom ? 'bottom' : 'top'} ${shown ? 'on' : ''}`}
          style={style}
        >
          {label}
          {hint && <span className="tip-hint">{hint}</span>}
        </span>,
        document.body,
      )}
    </span>
  );
}
