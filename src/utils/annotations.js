/**
 * Annotation geometry for the paper reader.
 *
 * Ported from the Millennium reader's model. Points are stored normalised to
 * the page box (0–1 on both axes) rather than in pixels: a mark made at 120%
 * zoom has to land in the same place at 240%, on a phone, and on a page whose
 * PDF dimensions differ from its neighbours'. Pixels would drift on every read.
 */

import { getPaperIdentity } from './paperIdentity';

/** Tools that create geometry by dragging, as opposed to clicking or doing nothing. */
export const DRAG_TOOLS = ['draw', 'line', 'arrow', 'highlight'];

/** Ink colours, chosen to sit on paper rather than shout over it. */
export const ANNOTATION_COLORS = [
  { id: 'ink', value: '#201f1d', label: 'Ink' },
  { id: 'gold', value: '#b68235', label: 'Gold' },
  { id: 'oxblood', value: '#8f3d3d', label: 'Oxblood' },
  { id: 'sea', value: '#2f6d8e', label: 'Sea' },
  { id: 'sage', value: '#4f6f5c', label: 'Sage' },
];

/** Highlighter tints. Laid under the page at low alpha, so they run lighter. */
export const HIGHLIGHT_COLORS = [
  { id: 'gold', value: '#e8b74a', label: 'Gold' },
  { id: 'rose', value: '#dd7f7f', label: 'Rose' },
  { id: 'sky', value: '#6aa9c9', label: 'Sky' },
  { id: 'mint', value: '#79b894', label: 'Mint' },
  { id: 'lilac', value: '#a58cc4', label: 'Lilac' },
];

export const DEFAULT_ANNOTATION_COLOR = ANNOTATION_COLORS[0].value;
export const HIGHLIGHT_DEFAULT_COLOR = HIGHLIGHT_COLORS[0].value;
export const MIN_STROKE_WIDTH = 1;
export const MAX_STROKE_WIDTH = 12;
export const ERASER_RADIUS = 0.012;

export function toolKind(tool) {
  switch (tool) {
    case 'draw': return 'draw';
    case 'line': return 'line';
    case 'arrow': return 'arrow';
    case 'highlight': return 'highlight';
    case 'text': return 'text';
    default: return null;
  }
}

export function makeAnnotationId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Extends a drag in progress.
 *
 * Free drawing accumulates points; every other drag tool is defined by its two
 * ends, so the second point is replaced rather than appended — otherwise a slow
 * drag leaves a line made of hundreds of collinear points.
 */
export function extendDraft(draft, point) {
  if (draft.kind !== 'draw') return { ...draft, points: [draft.points[0], point] };
  const last = draft.points[draft.points.length - 1];
  // Sub-pixel jitter from a trackpad would otherwise triple the point count.
  if (last && Math.hypot(last.x - point.x, last.y - point.y) < 0.0015) return draft;
  return { ...draft, points: [...draft.points, point] };
}

/** A drag that never moved is a stray click, not a mark the reader meant to leave. */
export function isDegenerateDraft(draft) {
  if (draft.kind === 'text') return false;
  if (draft.points.length < 2) return true;
  const [first] = draft.points;
  return draft.points.every((point) => Math.hypot(point.x - first.x, point.y - first.y) < 0.004);
}

function distanceToSegment(point, start, end) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return Math.hypot(point.x - start.x, point.y - start.y);

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / lengthSquared));
  return Math.hypot(point.x - (start.x + t * dx), point.y - (start.y + t * dy));
}

/**
 * Distance from a point to an annotation's path, in normalised units.
 *
 * Hit testing lives here rather than on the SVG because a stroke rendered one
 * pixel wide is essentially impossible to click. The eraser tests a radius.
 */
export function distanceToAnnotation(annotation, point) {
  const { points } = annotation;
  if (points.length === 0) return Number.POSITIVE_INFINITY;
  if (points.length === 1) return Math.hypot(points[0].x - point.x, points[0].y - point.y);

  let nearest = Number.POSITIVE_INFINITY;
  for (let index = 0; index < points.length - 1; index += 1) {
    nearest = Math.min(nearest, distanceToSegment(point, points[index], points[index + 1]));
  }
  return nearest;
}

/** Highlights sit under the page so the words stay readable through them. */
export function isUnderlay(kind) {
  return kind === 'highlight';
}

// ── Storage ─────────────────────────────────────────────────────────────────

const ANNOTATION_STORAGE_PREFIX = 'hsc_annotations_';

function storageKeyFor(paper) {
  return `${ANNOTATION_STORAGE_PREFIX}${getPaperIdentity(paper)}`;
}

export function loadAnnotations(paper) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKeyFor(paper)) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

export function saveAnnotations(paper, annotations) {
  try {
    const key = storageKeyFor(paper);
    if (!annotations || annotations.length === 0) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(annotations));
  } catch (error) {
    // Marks are a convenience; a full quota must not break the sitting.
  }
}
