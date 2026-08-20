/**
 * Sane text selection over a pdf.js text layer.
 *
 * The low-level `pdfjsLib.TextLayer` draws the spans and nothing else. All of
 * the behaviour that makes a selection feel like a selection lives in pdf.js's
 * *viewer* layer, which this reader does not use — and without it, pressing the
 * pointer down on blank space between two lines anchors the selection at the
 * first text node in the DOM, so a click near the bottom of a page silently
 * selects everything from the top of the paper down to the pointer.
 *
 * The fix pdf.js itself uses is a zero-content `.endOfContent` marker parked
 * after the spans. While a selection is being made the marker is stretched over
 * the whole page and moved next to the live end of the range, so the browser has
 * a real, unselectable node to anchor blank-space drags on. This is that
 * mechanism, extracted: an `attach` per layer, and one set of document listeners
 * shared by every layer on screen.
 */

/** Live text layers, each mapped to its own end-of-content marker. */
const layers = new Map();
let listeners = null;

function reset(end, layer) {
  layer.append(end);
  end.style.width = '';
  end.style.height = '';
  layer.classList.remove('selecting');
}

function resetAll() {
  layers.forEach(reset);
}

/**
 * Follows the live end of the selection, parking the marker beside it.
 *
 * Without this the marker sits after the last span, and dragging *upwards* from
 * blank space still snaps the far end of the range to the bottom of the page.
 */
function trackSelection(state) {
  const selection = document.getSelection();
  if (!selection || selection.rangeCount === 0) {
    resetAll();
    return;
  }

  const active = new Set();
  for (let index = 0; index < selection.rangeCount; index += 1) {
    const range = selection.getRangeAt(index);
    layers.forEach((_, layer) => {
      if (!active.has(layer) && range.intersectsNode(layer)) active.add(layer);
    });
  }

  layers.forEach((end, layer) => {
    if (active.has(layer)) layer.classList.add('selecting');
    else reset(end, layer);
  });

  // Firefox moves the anchor itself and re-parenting the marker fights it.
  if (state.isFirefox === undefined) {
    const first = layers.keys().next().value;
    state.isFirefox = first
      ? getComputedStyle(first).getPropertyValue('-moz-user-select') === 'none'
      : undefined;
  }
  if (state.isFirefox) return;

  const range = selection.getRangeAt(0);
  const previous = state.previousRange;
  const modifyStart = previous && (
    range.compareBoundaryPoints(Range.END_TO_END, previous) === 0
    || range.compareBoundaryPoints(Range.START_TO_END, previous) === 0
  );

  let anchor = modifyStart ? range.startContainer : range.endContainer;
  if (anchor.nodeType === Node.TEXT_NODE) anchor = anchor.parentNode;

  const layer = anchor.parentElement?.closest('.textLayer');
  const end = layer ? layers.get(layer) : null;
  if (end) {
    end.style.width = layer.style.width;
    end.style.height = layer.style.height;
    anchor.parentElement.insertBefore(end, modifyStart ? anchor : anchor.nextSibling);
  }

  state.previousRange = range.cloneRange();
}

function enableGlobalListeners() {
  if (listeners) return;

  const state = { previousRange: null, isFirefox: undefined };
  let isPointerDown = false;

  const onPointerDown = () => { isPointerDown = true; };
  const onPointerUp = () => { isPointerDown = false; resetAll(); };
  const onBlur = () => { isPointerDown = false; resetAll(); };
  const onKeyUp = () => { if (!isPointerDown) resetAll(); };
  const onSelectionChange = () => trackSelection(state);

  document.addEventListener('pointerdown', onPointerDown);
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('keyup', onKeyUp);
  document.addEventListener('selectionchange', onSelectionChange);
  window.addEventListener('blur', onBlur);

  listeners = () => {
    document.removeEventListener('pointerdown', onPointerDown);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('selectionchange', onSelectionChange);
    window.removeEventListener('blur', onBlur);
  };
}

/**
 * Gives one rendered text layer its end-of-content marker.
 *
 * @param {HTMLElement} layer the `.textLayer` container, already rendered
 * @returns {() => void} detach, safe to call more than once
 */
export function attachTextSelection(layer) {
  if (!layer || layers.has(layer)) return () => {};

  const end = document.createElement('div');
  end.className = 'endOfContent';
  layer.append(end);

  const onPointerDown = () => layer.classList.add('selecting');
  layer.addEventListener('pointerdown', onPointerDown);

  layers.set(layer, end);
  enableGlobalListeners();

  return () => {
    if (!layers.has(layer)) return;
    layer.removeEventListener('pointerdown', onPointerDown);
    layer.classList.remove('selecting');
    end.remove();
    layers.delete(layer);
    if (layers.size === 0 && listeners) {
      listeners();
      listeners = null;
    }
  };
}
