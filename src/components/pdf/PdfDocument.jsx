import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

import {
  DRAG_TOOLS,
  ERASER_RADIUS,
  distanceToAnnotation,
  extendDraft,
  isDegenerateDraft,
  isUnderlay,
  makeAnnotationId,
  toolKind,
} from '../../utils/annotations';
import { attachTextSelection } from '../../utils/pdfTextSelection';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

/** Pages this far outside the viewport are drawn, so scrolling stays ahead of the reader. */
const RENDER_MARGIN_PX = 900;
/** Canvases above this are wasteful; a retina screen is already covered at 2. */
const MAX_DEVICE_RATIO = 2;

function pathFor(annotation) {
  const [first, ...rest] = annotation.points;
  if (!first) return '';
  return `M ${first.x} ${first.y} ${rest.map((point) => `L ${point.x} ${point.y}`).join(' ')}`;
}

/**
 * One page: a raster canvas, a selectable text layer, and the annotation overlay.
 *
 * Rendering is deferred until the page is near the viewport, so a 68-page paper
 * does not rasterise every page up front — that, plus the raster/live scale
 * split, is what makes the zoom controls immediate instead of stalling.
 *
 * The page carries no live scale of its own. Its box is sized in CSS from
 * `--pdf-scale`, a variable the zoom hook writes straight onto the viewport, so
 * a wheel notch resizes every page without re-rendering a single component.
 */
function PdfPage({
  document: pdfDocument,
  pageNumber,
  baseSize,
  rasterScale,
  tool,
  annotations,
  draft,
  selectedId,
  textSelectable,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onSelect,
}) {
  const surfaceRef = useRef(null);
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);
  const renderTaskRef = useRef(null);
  const textLayerTaskRef = useRef(null);
  const detachSelectionRef = useRef(null);
  const [shouldRender, setShouldRender] = useState(false);

  useEffect(() => {
    const element = surfaceRef.current;
    if (!element || typeof IntersectionObserver === 'undefined') {
      setShouldRender(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      (entries) => entries.forEach((entry) => { if (entry.isIntersecting) setShouldRender(true); }),
      { rootMargin: `${RENDER_MARGIN_PX}px 0px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!shouldRender) return undefined;
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    let cancelled = false;
    // pdf.js refuses to draw onto a canvas already being drawn onto, and a zoom
    // that fires a second render before the first resolves leaves the canvas
    // holding half of each. Cancelling first is the fix; the abort it raises is
    // expected and swallowed below.
    renderTaskRef.current?.cancel();
    textLayerTaskRef.current?.cancel();

    (async () => {
      const page = await pdfDocument.getPage(pageNumber);
      if (cancelled) return;

      const viewport = page.getViewport({ scale: rasterScale });
      const ratio = Math.min(MAX_DEVICE_RATIO, window.devicePixelRatio || 1);
      canvas.width = Math.floor(viewport.width * ratio);
      canvas.height = Math.floor(viewport.height * ratio);

      const context = canvas.getContext('2d');
      if (!context) return;

      const task = page.render({
        canvasContext: context,
        viewport,
        transform: ratio === 1 ? undefined : [ratio, 0, 0, ratio, 0, 0],
      });
      renderTaskRef.current = task;
      await task.promise;
      if (cancelled) return;
      renderTaskRef.current = null;

      const container = textLayerRef.current;
      if (!container) return;
      detachSelectionRef.current?.();
      detachSelectionRef.current = null;
      container.replaceChildren();
      const textLayer = new pdfjsLib.TextLayer({
        textContentSource: page.streamTextContent(),
        container,
        viewport,
      });
      textLayerTaskRef.current = textLayer;
      await textLayer.render();
      if (cancelled) return;
      // Without the end-of-content marker, pressing down on blank space between
      // two lines anchors the selection at the top of the page.
      detachSelectionRef.current = attachTextSelection(container);
    })().catch(() => {
      // A cancelled render is the normal path through here during a zoom, and a
      // genuinely failed one leaves the previous bitmap rather than blanking.
    });

    return () => {
      cancelled = true;
      renderTaskRef.current?.cancel();
      renderTaskRef.current = null;
      textLayerTaskRef.current?.cancel();
      textLayerTaskRef.current = null;
      detachSelectionRef.current?.();
      detachSelectionRef.current = null;
    };
  }, [pdfDocument, pageNumber, rasterScale, shouldRender]);

  const pageAnnotations = annotations.filter((item) => item.page === pageNumber);
  const under = pageAnnotations.filter((item) => isUnderlay(item.kind));
  const notes = pageAnnotations.filter((item) => item.kind === 'text');
  const over = pageAnnotations.filter((item) => !isUnderlay(item.kind) && item.kind !== 'text');
  const activeDraft = draft?.page === pageNumber ? draft : null;

  const renderMark = (annotation) => {
    const isSelected = annotation.id === selectedId;
    const common = {
      onPointerDown: (event) => {
        if (tool !== 'select') return;
        event.stopPropagation();
        onSelect(annotation.id);
      },
      style: { cursor: tool === 'select' ? 'pointer' : 'inherit' },
    };

    if (annotation.kind === 'highlight') {
      const [start, end] = annotation.points;
      if (!start || !end) return null;
      return (
        <rect
          key={annotation.id}
          {...common}
          x={Math.min(start.x, end.x)}
          y={Math.min(start.y, end.y)}
          width={Math.abs(end.x - start.x)}
          height={Math.abs(end.y - start.y)}
          fill={annotation.color}
          opacity={0.28}
        />
      );
    }

    // `non-scaling-stroke` keeps the weight constant in screen pixels, so the
    // width is given in pixels rather than the 0-1 page units of the viewBox.
    const strokeProps = {
      stroke: annotation.color,
      strokeWidth: annotation.strokeWidth,
      fill: 'none',
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      vectorEffect: 'non-scaling-stroke',
    };

    if (annotation.kind === 'arrow') {
      const [start, end] = annotation.points;
      if (!start || !end) return null;
      const angle = Math.atan2(end.y - start.y, end.x - start.x);
      const head = 0.022;
      return (
        <g key={annotation.id} {...common}>
          <line x1={start.x} y1={start.y} x2={end.x} y2={end.y} {...strokeProps} />
          <polyline
            points={[
              `${end.x - head * Math.cos(angle - Math.PI / 7)},${end.y - head * Math.sin(angle - Math.PI / 7)}`,
              `${end.x},${end.y}`,
              `${end.x - head * Math.cos(angle + Math.PI / 7)},${end.y - head * Math.sin(angle + Math.PI / 7)}`,
            ].join(' ')}
            {...strokeProps}
          />
        </g>
      );
    }

    return (
      <path key={annotation.id} {...common} d={pathFor(annotation)} {...strokeProps} opacity={isSelected ? 0.7 : 1} />
    );
  };

  // Text is selectable only when a tool that does not draw is armed, so a drag
  // meant to highlight never selects the page text underneath instead.
  const canSelectText = textSelectable && (tool === 'select' || tool === 'hand');

  return (
    <div className="pdf-page">
      <div
        ref={surfaceRef}
        className="pdf-page-sheet"
        style={{
          // The box is `--page-w × --pdf-scale` in CSS; only the unscaled size
          // and the scale the bitmap was drawn at need to come from React.
          '--page-w': `${baseSize.width}px`,
          '--page-h': `${baseSize.height}px`,
          '--raster-scale': rasterScale,
        }}
      >
        <canvas ref={canvasRef} />

        <svg className="pdf-layer pdf-layer-under" viewBox="0 0 1 1" preserveAspectRatio="none">
          {under.map(renderMark)}
        </svg>

        {/*
          Sized at the raster scale and stretched to the live scale by the
          stylesheet: pdf.js positions every span in pixels derived from the
          viewport it was built with, so re-laying the text out on each wheel
          notch would cost as much as the raster it is avoiding. pdf.js sets the
          layer's own width and height from `--scale-factor`; the stretch on top
          is `--pdf-scale / --raster-scale`, both read from CSS.
        */}
        <div
          ref={textLayerRef}
          className="textLayer"
          data-selectable={canSelectText ? 'true' : 'false'}
          style={{
            // pdf.js renamed this variable in v4; both names are set so the
            // layer positions correctly whichever the installed build reads.
            '--total-scale-factor': rasterScale,
            '--scale-factor': rasterScale,
          }}
        />

        <svg
          className={`pdf-layer pdf-layer-over tool-${tool}`}
          viewBox="0 0 1 1"
          preserveAspectRatio="none"
          onPointerDown={(event) => onPointerDown(event, pageNumber)}
          onPointerMove={(event) => onPointerMove(event, pageNumber)}
          onPointerUp={(event) => onPointerUp(event, pageNumber)}
          onPointerLeave={(event) => onPointerUp(event, pageNumber)}
        >
          {over.map(renderMark)}
          {activeDraft && renderMark(activeDraft)}
        </svg>

        {/* Notes are HTML, not SVG: the overlay's viewBox is stretched to the
            page box, which would distort any glyph drawn inside it. */}
        <div className="pdf-note-layer">
          {notes.map((note) => {
            const [anchor] = note.points;
            if (!anchor) return null;
            return (
              <span
                key={note.id}
                className={`pdf-note ${note.id === selectedId ? 'on' : ''}`}
                style={{
                  left: `${anchor.x * 100}%`,
                  top: `${anchor.y * 100}%`,
                  color: note.color,
                  fontSize: `${11 + note.strokeWidth * 2}px`,
                  pointerEvents: tool === 'select' ? 'auto' : 'none',
                }}
                onPointerDown={(event) => {
                  if (tool !== 'select') return;
                  event.stopPropagation();
                  onSelect(note.id);
                }}
              >
                {note.text || 'Note'}
              </span>
            );
          })}
        </div>
      </div>
      <div className="pdf-page-number num">{pageNumber}</div>
    </div>
  );
}

/**
 * The paper itself.
 *
 * A real pdf.js viewer rather than the browser's plug-in, so the page can carry
 * an annotation layer and a selectable text layer, obey the portal's own zoom,
 * and sit on the paper ground.
 */
export default function PdfDocument({
  url,
  zoom,
  tool,
  color,
  strokeWidth,
  annotations,
  onCommit,
  onDirectChange,
  selectedId,
  onSelectedIdChange,
  onDocumentLoaded,
  onSelectionChange,
  viewportRef,
  contentRef,
  textSelectable = true,
}) {
  const [pdfDocument, setPdfDocument] = useState(null);
  const [baseSizes, setBaseSizes] = useState([]);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const [draft, setDraft] = useState(null);
  const drawingRef = useRef(false);
  const { rasterScale, zoomAtPoint, getScale } = zoom;

  useEffect(() => {
    if (!url) return undefined;
    let cancelled = false;
    setStatus('loading');
    setError(null);
    setBaseSizes([]);
    setPdfDocument(null);

    const task = pdfjsLib.getDocument({ url, isEvalSupported: false });
    task.promise
      .then(async (loaded) => {
        if (cancelled) return;
        // Only the unscaled page boxes are measured up front. The pages
        // themselves are rasterised as they come into view.
        const sizes = await Promise.all(
          Array.from({ length: loaded.numPages }, async (_, index) => {
            const page = await loaded.getPage(index + 1);
            const viewport = page.getViewport({ scale: 1 });
            return { width: viewport.width, height: viewport.height };
          }),
        );
        if (cancelled) return;

        setPdfDocument(loaded);
        setBaseSizes(sizes);
        setStatus('ready');

        // The first page carries the stated reading and working allowance.
        const firstPage = await loaded.getPage(1);
        const firstText = await firstPage.getTextContent();
        if (cancelled) return;
        onDocumentLoaded?.({
          pageCount: loaded.numPages,
          widestPage: Math.max(...sizes.map((size) => size.width)),
          firstPageText: firstText.items.map((item) => item.str || '').join(' '),
        });
      })
      .catch((loadError) => {
        if (cancelled) return;
        setStatus('error');
        setError(loadError?.message || 'The paper could not be opened.');
      });

    return () => {
      cancelled = true;
      task.destroy?.();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  // Any of ⌘, Ctrl or Alt with the wheel zooms about the pointer — a trackpad
  // pinch arrives here too, as a ctrl-wheel. Registered natively because React's
  // synthetic wheel listener is passive and cannot preventDefault the browser's
  // own page zoom.
  //
  // The scale is read out of the hook rather than closed over, so a burst of
  // notches compounds against what the last one actually applied. Reading a
  // state value here meant every notch inside one frame multiplied the same
  // stale scale, and the document barely moved.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const handleWheel = (event) => {
      if (!event.ctrlKey && !event.metaKey && !event.altKey) return;
      event.preventDefault();
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      if (!delta) return;
      // Multiplicative, so each notch changes the zoom by a constant proportion
      // and the step stays even across the whole range.
      const magnitude = (Math.min(Math.abs(delta), 60) / 60) * 0.2;
      const factor = delta > 0 ? 1 - magnitude : 1 + magnitude;
      zoomAtPoint(getScale() * factor, event.clientX, event.clientY);
    };

    viewport.addEventListener('wheel', handleWheel, { passive: false });
    return () => viewport.removeEventListener('wheel', handleWheel);
  }, [getScale, viewportRef, zoomAtPoint]);

  // Two-finger pinch on touch screens. A trackpad pinch arrives as ctrl-wheel.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return undefined;

    const pointers = new Map();
    let pinch = null;

    const spread = () => {
      const [first, second] = [...pointers.values()];
      return Math.hypot(first.x - second.x, first.y - second.y);
    };
    const centre = () => {
      const [first, second] = [...pointers.values()];
      return { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 };
    };

    const handleDown = (event) => {
      if (event.pointerType !== 'touch') return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size === 2) pinch = { distance: spread(), scale: getScale() };
    };

    const handleMove = (event) => {
      if (event.pointerType !== 'touch' || !pointers.has(event.pointerId)) return;
      pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (pointers.size !== 2 || !pinch || pinch.distance === 0) return;
      event.preventDefault();
      const point = centre();
      zoomAtPoint(pinch.scale * (spread() / pinch.distance), point.x, point.y);
    };

    const handleUp = (event) => {
      pointers.delete(event.pointerId);
      // A finger that leaves without a pointerup would otherwise stay in the map
      // and make the next single-finger drag look like half a pinch.
      if (pointers.size < 2) pinch = null;
    };

    viewport.addEventListener('pointerdown', handleDown);
    viewport.addEventListener('pointermove', handleMove, { passive: false });
    viewport.addEventListener('pointerup', handleUp);
    viewport.addEventListener('pointercancel', handleUp);
    viewport.addEventListener('pointerleave', handleUp);
    return () => {
      viewport.removeEventListener('pointerdown', handleDown);
      viewport.removeEventListener('pointermove', handleMove);
      viewport.removeEventListener('pointerup', handleUp);
      viewport.removeEventListener('pointercancel', handleUp);
      viewport.removeEventListener('pointerleave', handleUp);
      pointers.clear();
    };
  }, [getScale, viewportRef, zoomAtPoint]);

  // Whatever the reader has selected on the page, handed up so the margin can
  // quote it and the agent can be asked about it.
  useEffect(() => {
    if (!onSelectionChange) return undefined;

    const handleSelection = () => {
      const selection = window.getSelection?.();
      const text = selection ? String(selection).trim() : '';
      const inside = selection?.anchorNode && viewportRef.current?.contains(selection.anchorNode);
      onSelectionChange(inside && text.length > 1 ? text : '');
    };

    document.addEventListener('selectionchange', handleSelection);
    return () => document.removeEventListener('selectionchange', handleSelection);
  }, [onSelectionChange, viewportRef]);

  /** Pointer position as a fraction of the page box. */
  const pointFor = useCallback((event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (event.clientY - rect.top) / rect.height)),
    };
  }, []);

  const handlePointerDown = useCallback((event, pageNumber) => {
    if (tool === 'select' || tool === 'hand') return;
    const point = pointFor(event);

    if (tool === 'eraser') {
      const survivors = annotations.filter((annotation) => (
        annotation.page !== pageNumber || distanceToAnnotation(annotation, point) > ERASER_RADIUS
      ));
      if (survivors.length !== annotations.length) onCommit(survivors);
      drawingRef.current = true;
      return;
    }

    const kind = toolKind(tool);
    if (!kind) return;

    event.currentTarget.setPointerCapture?.(event.pointerId);
    drawingRef.current = true;

    const next = {
      id: makeAnnotationId(),
      page: pageNumber,
      kind,
      points: [point, point],
      color,
      strokeWidth,
      text: kind === 'text' ? 'Note' : undefined,
    };

    if (kind === 'text') {
      onCommit([...annotations, { ...next, points: [point] }]);
      onSelectedIdChange(next.id);
      drawingRef.current = false;
      return;
    }

    setDraft(next);
  }, [annotations, color, onCommit, onSelectedIdChange, pointFor, strokeWidth, tool]);

  const handlePointerMove = useCallback((event, pageNumber) => {
    if (!drawingRef.current) return;
    const point = pointFor(event);

    if (tool === 'eraser') {
      const survivors = annotations.filter((annotation) => (
        annotation.page !== pageNumber || distanceToAnnotation(annotation, point) > ERASER_RADIUS
      ));
      // Erasing during a drag writes straight through, so a sweep is one history
      // entry rather than one per annotation it happens to cross.
      if (survivors.length !== annotations.length) onDirectChange(survivors);
      return;
    }

    if (!DRAG_TOOLS.includes(tool)) return;
    setDraft((current) => (current ? extendDraft(current, point) : current));
  }, [annotations, onDirectChange, pointFor, tool]);

  const handlePointerUp = useCallback(() => {
    drawingRef.current = false;
    // Read the draft from state here rather than inside the updater: React runs
    // updaters during render, and committing from one updates the parent mid-render.
    if (draft) {
      // A click that never became a drag is a stray tap, not a mark.
      if (!isDegenerateDraft(draft)) onCommit([...annotations, draft]);
      setDraft(null);
    }
  }, [annotations, draft, onCommit]);

  const body = useMemo(() => (pdfDocument ? baseSizes.map((baseSize, index) => (
    <PdfPage
      key={index}
      document={pdfDocument}
      pageNumber={index + 1}
      baseSize={baseSize}
      rasterScale={rasterScale}
      annotations={annotations}
      draft={draft}
      selectedId={selectedId}
      tool={tool}
      textSelectable={textSelectable}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onSelect={onSelectedIdChange}
    />
  )) : null), [
    pdfDocument, baseSizes, rasterScale, annotations, draft, selectedId, tool,
    textSelectable, handlePointerDown, handlePointerMove, handlePointerUp, onSelectedIdChange,
  ]);

  return (
    <div className={`pdf-scroll pane-scroll tool-${tool}`} ref={viewportRef} tabIndex={-1}>
      {status === 'loading' && (
        <div className="pdf-state">
          <span className="kick">Opening</span>
          <p className="dim" style={{ fontSize: '13px', marginTop: '6px' }}>Setting the paper…</p>
        </div>
      )}

      {status === 'error' && (
        <div className="pdf-state">
          <span className="kick">Could not open</span>
          <p className="dim" style={{ fontSize: '13px', maxWidth: '44ch', textAlign: 'center', marginTop: '6px' }}>
            {error}
          </p>
          <a className="btn btn-secondary" href={url} target="_blank" rel="noopener noreferrer" style={{ marginTop: '12px' }}>
            Open the PDF directly
          </a>
        </div>
      )}

      {status === 'ready' && <div className="pdf-pages" ref={contentRef}>{body}</div>}
    </div>
  );
}
