import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarPlus,
  ChevronRight,
  Gauge,
  ListChecks,
  Timer,
} from 'lucide-react';
import { applyLibraryQuery, parseLibraryQuery } from '../utils/libraryQuery';
import { usePresence } from '../utils/usePresence';
import { getAllowanceForRung } from '../utils/practiceLadder';
import { getPaperIdentity } from '../utils/paperIdentity';

const MAX_PAPERS = 3;

/**
 * The one command line. No chrome: type a paper and press return to sit it, or
 * pick one of the actions underneath.
 */
export default function CommandPalette({
  isOpen,
  onClose,
  papers = [],
  subjects = [],
  schools = [],
  ladder = [],
  selectedLevel = 12,
  onBeginSitting,
  onAsk,
  onNavigate,
}) {
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef(null);
  const presence = usePresence(isOpen, 220);

  useEffect(() => {
    if (!isOpen) return;
    setQuery('');
    setCursor(0);
    const id = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(id);
  }, [isOpen]);

  const paperMatches = useMemo(() => {
    if (!isOpen || query.trim().length < 2) return [];
    const parsed = parseLibraryQuery(query, { subjects });
    const pool = papers.filter((paper) => paper.l === selectedLevel);
    return applyLibraryQuery(pool, parsed, { subjects, schools })
      .slice()
      .sort((left, right) => (parseInt(String(right.y), 10) || 0) - (parseInt(String(left.y), 10) || 0))
      .slice(0, MAX_PAPERS);
  }, [isOpen, query, papers, subjects, schools, selectedLevel]);

  const actions = useMemo(() => {
    const weakest = [...ladder].sort((left, right) => left.rung - right.rung)[0];
    return [
      {
        id: 'library',
        icon: Timer,
        name: query.trim() ? `Search the library for “${query.trim()}”` : 'Open the library index',
        hint: '⌘⏎',
        run: () => onNavigate?.('library', query.trim()),
      },
      {
        id: 'notebook',
        icon: ListChecks,
        name: weakest
          ? `Drill the mistakes holding ${weakest.subject} on rung ${weakest.rung}`
          : 'Open the mistake notebook',
        hint: '',
        run: () => onNavigate?.('notebook'),
      },
      {
        id: 'calendar',
        icon: CalendarPlus,
        name: 'Open the calendar and pencil in a sitting',
        hint: '',
        run: () => onNavigate?.('calendar'),
      },
      {
        id: 'ask',
        icon: Gauge,
        name: query.trim() ? `Ask the agent: “${query.trim()}”` : 'Ask the agent about your marks',
        hint: '⌥⏎',
        run: () => onAsk?.(query.trim()),
      },
    ];
  }, [ladder, query, onNavigate, onAsk]);

  const rows = useMemo(() => ([
    ...paperMatches.map((paper) => ({ kind: 'paper', paper })),
    ...actions.map((action) => ({ kind: 'action', action })),
  ]), [paperMatches, actions]);

  useEffect(() => {
    setCursor((current) => Math.min(current, Math.max(0, rows.length - 1)));
  }, [rows.length]);

  if (!presence.mounted) return null;

  const allowanceFor = (paper) => {
    const entry = ladder.find((row) => row.subject === subjects[paper.s]);
    return entry ? entry.allowance : getAllowanceForRung(1);
  };

  const runRow = (row, event) => {
    if (!row) return;
    if (row.kind === 'action') {
      row.action.run();
      onClose?.();
      return;
    }
    if (event?.altKey) {
      onAsk?.(`Tell me about ${schools[row.paper.h] || row.paper.n} ${row.paper.y} — ${subjects[row.paper.s]}`);
      onClose?.();
      return;
    }
    const allowance = event?.shiftKey ? 'toTime' : allowanceFor(row.paper).id;
    onBeginSitting?.(row.paper, allowance);
    onClose?.();
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose?.();
      return;
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setCursor((current) => (current + 1) % Math.max(1, rows.length));
      return;
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setCursor((current) => (current - 1 + Math.max(1, rows.length)) % Math.max(1, rows.length));
      return;
    }
    if (event.key === 'Enter') {
      event.preventDefault();
      runRow(rows[cursor], event);
    }
  };

  return (
    <div className={`cmdk-backdrop is-${presence.stage}`} role="presentation" onMouseDown={onClose}>
      <div
        className="cmdk"
        role="dialog"
        aria-modal="true"
        aria-label="Command line"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="cmdk-line">
          <span style={{ color: 'var(--color-accent)', display: 'flex' }}><ChevronRight size={17} /></span>
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="chem 2021 trial no sol"
            aria-label="Search or ask"
          />
          <span className="kbd">esc</span>
        </div>

        <div className="cmdk-scroll">
          {paperMatches.length > 0 && (
            <div className="cmdk-group">
              <div className="kick">Sit a paper</div>
              {paperMatches.map((paper, index) => (
                <div
                  key={getPaperIdentity(paper)}
                  className={`cmdk-row ${cursor === index ? 'on' : ''}`}
                  onMouseEnter={() => setCursor(index)}
                  onClick={(event) => runRow(rows[index], event)}
                >
                  <span style={{ fontFamily: 'var(--font-heading)', fontSize: '16px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {schools[paper.h] || paper.n} {paper.y} — {subjects[paper.s]}
                  </span>
                  <span className="num dim" style={{ fontSize: '12px' }}>
                    {paper.c === 'H' ? 'hsc' : paper.c === 'A' ? 'task' : 'trial'}
                    {paper.w === 1 ? ' · solutions' : ' · no solutions'}
                  </span>
                  <span style={{ font: '11px var(--font-num)', color: 'var(--color-accent-700)' }}>
                    {cursor === index ? '↵' : ''}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="cmdk-group">
            <div className="kick">Do something</div>
            {actions.map((action, index) => {
              const rowIndex = paperMatches.length + index;
              const Icon = action.icon;
              return (
                <div
                  key={action.id}
                  className={`cmdk-row ${cursor === rowIndex ? 'on' : ''}`}
                  onMouseEnter={() => setCursor(rowIndex)}
                  onClick={(event) => runRow(rows[rowIndex], event)}
                >
                  <span style={{ color: 'var(--color-accent)', display: 'flex' }}><Icon size={14} /></span>
                  <span style={{ fontSize: '14px', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {action.name}
                  </span>
                  <span className="kbd">{action.hint}</span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="cmdk-foot">
          <span>↑↓ move</span>
          <span>↵ begin at your allowance</span>
          <span>⇧↵ begin to time</span>
          <span>⌥↵ ask the agent</span>
        </div>
      </div>
    </div>
  );
}
