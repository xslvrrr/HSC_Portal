import { useEffect } from 'react';

/**
 * Closes an open overlay on Escape. Every dialog in the portal is dismissable
 * the same way, so the behaviour lives in one place rather than in each one.
 *
 * @param {boolean} isActive whether the overlay is currently open
 * @param {() => void} onEscape
 */
export function useEscapeKey(isActive, onEscape) {
  useEffect(() => {
    if (!isActive || typeof onEscape !== 'function') return undefined;

    const handleKeyDown = (event) => {
      if (event.key === 'Escape') {
        event.stopPropagation();
        onEscape();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onEscape]);
}
