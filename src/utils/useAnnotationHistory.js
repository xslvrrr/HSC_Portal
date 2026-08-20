import { useCallback, useEffect, useRef, useState } from 'react';

/** Deep enough for a drawing session, shallow enough that the stack stays small. */
const HISTORY_LIMIT = 100;

/**
 * Undo and redo for page annotations.
 *
 * Ported from the Millennium reader. The viewer does not own its annotations —
 * the practice room loads and persists them — so history cannot live in a
 * reducer beside the data. Two stacks of whole annotation lists instead: a list
 * is a few hundred bytes per mark, the operations are coarse (one stroke, one
 * erase, one text edit), and a snapshot stack cannot drift out of step with a
 * parent that also writes the array directly.
 */
export function useAnnotationHistory(documentId, annotations, onAnnotationsChange) {
  const past = useRef([]);
  const future = useRef([]);

  // Refs so a commit does not depend on a render having flushed, but the toolbar
  // has to grey out its buttons, so depth is mirrored into state.
  const [depths, setDepths] = useState({ past: 0, future: 0 });

  const currentRef = useRef(annotations);
  currentRef.current = annotations;

  const changeRef = useRef(onAnnotationsChange);
  changeRef.current = onAnnotationsChange;

  // A different paper is a different history. Carrying the stack across would
  // let undo paste one paper's marks onto another.
  useEffect(() => {
    past.current = [];
    future.current = [];
    setDepths({ past: 0, future: 0 });
  }, [documentId]);

  const sync = useCallback(() => {
    setDepths({ past: past.current.length, future: future.current.length });
  }, []);

  const commit = useCallback((next) => {
    past.current = [...past.current, currentRef.current].slice(-HISTORY_LIMIT);
    future.current = [];
    sync();
    changeRef.current(next);
  }, [sync]);

  const undo = useCallback(() => {
    const previous = past.current[past.current.length - 1];
    if (!previous) return;
    past.current = past.current.slice(0, -1);
    future.current = [...future.current, currentRef.current].slice(-HISTORY_LIMIT);
    sync();
    changeRef.current(previous);
  }, [sync]);

  const redo = useCallback(() => {
    const next = future.current[future.current.length - 1];
    if (!next) return;
    future.current = future.current.slice(0, -1);
    past.current = [...past.current, currentRef.current].slice(-HISTORY_LIMIT);
    sync();
    changeRef.current(next);
  }, [sync]);

  return { commit, undo, redo, canUndo: depths.past > 0, canRedo: depths.future > 0 };
}
