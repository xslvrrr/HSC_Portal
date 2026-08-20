import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/**
 * Zoom state for a scrolling document viewer.
 *
 * Ported from the Millennium reader, and rebuilt so that a zoom costs a style
 * write rather than a React render.
 *
 * Three scales, and the split between them is the whole point of this hook.
 *
 * The *live* scale is what the reader asked for. It changes on every wheel notch
 * and every pinch frame, and it lives in a ref and a CSS variable rather than in
 * state: the page boxes are sized in CSS from that variable, so they resize in
 * the same style recalculation that set it. Nothing re-renders. Driving it
 * through state instead re-rendered every page component per notch, which on a
 * sixty-page paper is what made the zoom buttons crawl.
 *
 * The *raster* scale is what pdf.js has actually drawn. It follows the live
 * scale only once the gesture settles, because re-rasterising a page costs tens
 * of milliseconds and doing it per notch queues a dozen overlapping render tasks
 * against the same canvas. Between the two scales the existing bitmap is
 * stretched by CSS, so the page is momentarily soft and then snaps crisp — which
 * is what every native PDF reader does.
 *
 * The *display* scale is only the toolbar's readout. It is coalesced to one
 * update per frame so the percentage stays honest without a render per notch.
 */

export const MIN_SCALE = 0.35;
export const MAX_SCALE = 6;
/** Long enough that a wheel burst counts as one gesture, short enough to feel immediate. */
const RASTER_SETTLE_MS = 160;
/** Page-stack padding, so a fitted page is not pressed against the pane edge. */
const FIT_PADDING_PX = 48;

export function clampScale(value) {
  // Three decimal places. At two, a small trackpad delta rounds straight back
  // onto the committed scale and the document sits still until a larger delta
  // arrives and moves it in one visible lurch.
  return Math.min(MAX_SCALE, Math.max(MIN_SCALE, Math.round(value * 1000) / 1000));
}

export function usePdfZoom(viewportRef, contentRef, initialScale = 1.2) {
  const [rasterScale, setRasterScale] = useState(initialScale);
  const [displayScale, setDisplayScale] = useState(initialScale);

  /** The scale the CSS variable currently holds — the authority for every gesture. */
  const scaleRef = useRef(initialScale);
  const settleTimerRef = useRef(null);
  const readoutFrameRef = useRef(0);

  // Written on every commit, not just the first, so a remounted page stack (a
  // new paper, or the viewer leaving its loading state) is never left at 1.
  useLayoutEffect(() => {
    viewportRef.current?.style.setProperty('--pdf-scale', String(scaleRef.current));
  });

  const scheduleReadout = useCallback(() => {
    if (readoutFrameRef.current) return;
    readoutFrameRef.current = requestAnimationFrame(() => {
      readoutFrameRef.current = 0;
      setDisplayScale(scaleRef.current);
    });
  }, []);

  const scheduleRaster = useCallback(() => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      setRasterScale(scaleRef.current);
    }, RASTER_SETTLE_MS);
  }, []);

  /**
   * Zooms about a point on screen so the content under it stays put.
   *
   * The anchor is captured in document coordinates rather than derived from
   * `scrollLeft`, because the viewport centres the page stack while it fits: the
   * stack's offset inside the scroll box is not `-scrollLeft`, and a scroll-only
   * correction throws the page sideways when a zoom crosses the width where
   * centring stops applying.
   */
  const zoomAtPoint = useCallback((nextScale, clientX, clientY) => {
    const target = clampScale(nextScale);
    const painted = scaleRef.current;
    if (target === painted) return;

    const viewport = viewportRef.current;
    const content = contentRef.current;

    if (!viewport || !content) {
      scaleRef.current = target;
      scheduleReadout();
      scheduleRaster();
      return;
    }

    const viewportRect = viewport.getBoundingClientRect();
    const before = content.getBoundingClientRect();
    const anchor = {
      contentX: (clientX - before.left) / painted,
      contentY: (clientY - before.top) / painted,
      offsetX: clientX - viewportRect.left,
      offsetY: clientY - viewportRect.top,
    };

    scaleRef.current = target;
    viewport.style.setProperty('--pdf-scale', String(target));

    // Reading the box straight back flushes the new layout here, so the
    // correction is measured rather than predicted. One forced layout per
    // gesture frame is far cheaper than the render pass it replaces.
    const after = content.getBoundingClientRect();
    viewport.scrollLeft += after.left - viewportRect.left + anchor.contentX * target - anchor.offsetX;
    viewport.scrollTop += after.top - viewportRect.top + anchor.contentY * target - anchor.offsetY;

    scheduleReadout();
    scheduleRaster();
  }, [contentRef, scheduleRaster, scheduleReadout, viewportRef]);

  /** Zoom from the centre of the viewport, for buttons and keyboard shortcuts. */
  const zoomBy = useCallback((factor) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const centreX = rect ? rect.left + rect.width / 2 : 0;
    const centreY = rect ? rect.top + rect.height / 2 : 0;
    zoomAtPoint(scaleRef.current * factor, centreX, centreY);
  }, [viewportRef, zoomAtPoint]);

  const setScale = useCallback((scale) => {
    const rect = viewportRef.current?.getBoundingClientRect();
    const centreX = rect ? rect.left + rect.width / 2 : 0;
    const centreY = rect ? rect.top + rect.height / 2 : 0;
    zoomAtPoint(scale, centreX, centreY);
  }, [viewportRef, zoomAtPoint]);

  /** `contentWidth` is the widest page at scale 1, so the result fits it exactly. */
  const fitToWidth = useCallback((contentWidth) => {
    const viewport = viewportRef.current;
    if (!viewport || contentWidth <= 0) return;
    const available = viewport.clientWidth - FIT_PADDING_PX;
    if (available <= 0) return;
    setScale(available / contentWidth);
  }, [setScale, viewportRef]);

  /** The live scale, for callers that must not re-render to read it. */
  const getScale = useCallback(() => scaleRef.current, []);

  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current);
    if (readoutFrameRef.current) cancelAnimationFrame(readoutFrameRef.current);
  }, []);

  return {
    /** What the toolbar shows. Lags the gesture by at most one frame. */
    liveScale: displayScale,
    rasterScale,
    isRasterStale: Math.abs(displayScale - rasterScale) > 0.001,
    getScale,
    zoomAtPoint,
    zoomBy,
    setScale,
    fitToWidth,
    minScale: MIN_SCALE,
    maxScale: MAX_SCALE,
  };
}
