import { useEffect, useMemo, useRef, useState } from 'react';
import { Bookmark, Clock, LayoutGrid, List, Search, Sparkles } from 'lucide-react';
import { PAPER_TYPES, applyLibraryQuery, parseLibraryQuery, withFacet } from '../utils/libraryQuery';
import { ALLOWANCES, getAllowanceForRung } from '../utils/practiceLadder';
import { getPaperIdentity } from '../utils/paperIdentity';
import { SORT_MODES, buildPaperConsensus, sortPapers } from '../utils/paperRanking';
import { describeSubjectTiming } from '../utils/subjectTiming';
import { usePresence } from '../utils/usePresence';

const INDEX_COLUMNS = '52px minmax(0, 1fr) 132px 74px 60px 108px 44px';
const PAGE_SIZE = 40;
const SORT_STORAGE_KEY = 'hsc_library_sort';

const ONLY_FILTERS = [
  { id: 'all', label: 'Everything' },
  { id: 'solutions', label: 'With solutions' },
  { id: 'unsat', label: 'Not yet sat' },
  { id: 'saved', label: 'Saved' },
];

/**
 * The bar that appears under a chosen paper, in either layout.
 *
 * In cards it docks to the foot of the pane rather than sitting under the grid.
 * Rendered in flow it landed below forty tiles, so choosing a card near the top
 * of the page appeared to do nothing at all and the paper could not be opened.
 */
function QuickStart({
  open, paper, subjects, schools, isSat, docked = false,
  suggestedAllowance, chosenAllowance, onAllowanceChange, onBegin, onOpen,
}) {
  const presence = usePresence(open, 180);
  // The paper is held through the exit, so the bar animates out showing what it
  // was rather than blanking a frame before it goes.
  const shownRef = useRef(paper);
  if (paper) shownRef.current = paper;
  const shown = paper || shownRef.current;

  if (!presence.mounted || !shown) return null;

  const timing = describeSubjectTiming(subjects[shown.s]);

  return (
    <div className={`quickstart is-${presence.stage} ${docked ? 'is-docked' : ''}`}>
      <div style={{ flex: '1 1 240px', minWidth: 0 }}>
        <div style={{ fontFamily: 'var(--font-heading)', fontSize: '17px' }}>
          {schools[shown.h] || shown.n} {shown.y}{' '}
          <span className="num dim" style={{ fontFamily: 'var(--font-body)', fontSize: '12.5px' }}>
            · {subjects[shown.s]}{shown.w === 1 ? ' · solutions' : ''} · {timing.label}
          </span>
        </div>
        <div className="dim" style={{ fontSize: '12px', marginTop: '2px' }}>
          {isSat ? 'Already sat. ' : 'Not sat. '}
          Your allowance for {subjects[shown.s]} is{' '}
          <span style={{ color: 'var(--color-accent-700)' }}>{suggestedAllowance.label.toLowerCase()}</span>.
        </div>
      </div>
      <div className="seg">
        {ALLOWANCES.map((allowance) => (
          <label key={allowance.id} className="seg-opt">
            <input
              type="radio"
              name="library-allowance"
              checked={chosenAllowance === allowance.id}
              onChange={() => onAllowanceChange(allowance.id)}
            />
            <span>{allowance.label}</span>
          </label>
        ))}
      </div>
      {onOpen && (
        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => onOpen(shown)}
          title="Open the paper without setting a clock"
        >
          Just read it
        </button>
      )}
      <button type="button" className="btn btn-primary" onClick={() => onBegin?.(shown, chosenAllowance)}>
        Begin
      </button>
    </div>
  );
}

export default function LibraryView({
  papers = [],
  subjects = [],
  schools = [],
  ladder = [],
  selectedLevel = 12,
  onLevelChange,
  query = '',
  onQueryChange,
  bookmarks = new Set(),
  onToggleBookmark,
  satPaperIds = new Set(),
  onOpenPaper,
  onBeginSitting,
  onAsk,
}) {
  const [schoolFilter, setSchoolFilter] = useState('');
  const [onlyFilter, setOnlyFilter] = useState('all');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [activeIdentity, setActiveIdentity] = useState(null);
  const [allowanceId, setAllowanceId] = useState(null);
  const [layout, setLayout] = useState(() => {
    try { return localStorage.getItem('hsc_library_layout') === 'cards' ? 'cards' : 'index'; }
    catch (error) { return 'index'; }
  });
  const [sortMode, setSortMode] = useState(() => {
    try {
      const stored = localStorage.getItem(SORT_STORAGE_KEY);
      return SORT_MODES.some((mode) => mode.id === stored) ? stored : 'consensus';
    } catch (error) { return 'consensus'; }
  });
  const sentinelRef = useRef(null);

  // Standing is read from the whole index rather than the current search, so
  // narrowing to one subject does not quietly redefine which schools are prolific.
  const consensus = useMemo(() => buildPaperConsensus(papers), [papers]);

  const parsed = useMemo(
    () => parseLibraryQuery(query, { subjects }),
    [query, subjects],
  );

  const levelPapers = useMemo(
    () => papers.filter((paper) => paper.l === selectedLevel),
    [papers, selectedLevel],
  );

  const searched = useMemo(
    () => applyLibraryQuery(levelPapers, parsed, { subjects, schools }),
    [levelPapers, parsed, subjects, schools],
  );

  const results = useMemo(() => {
    const schoolTerm = schoolFilter.trim().toLowerCase();

    const filtered = searched.filter((paper) => {
      if (schoolTerm && !String(schools[paper.h] || '').toLowerCase().includes(schoolTerm)) return false;
      if (onlyFilter === 'solutions' && paper.w !== 1) return false;
      if (onlyFilter === 'unsat' && satPaperIds.has(getPaperIdentity(paper))) return false;
      if (onlyFilter === 'saved' && !bookmarks.has(`${paper.v}_${paper.n}`)) return false;
      return true;
    });

    return sortPapers(filtered, sortMode, { consensus, schools });
  }, [searched, schoolFilter, onlyFilter, satPaperIds, bookmarks, schools, sortMode, consensus]);

  // Subject counts are read from the level, not the search, so the facet list
  // stays a stable table of contents rather than collapsing as you type.
  const subjectFacets = useMemo(() => {
    const counts = new Map();
    levelPapers.forEach((paper) => counts.set(paper.s, (counts.get(paper.s) || 0) + 1));
    return [...counts.entries()]
      .map(([index, count]) => ({ index, name: subjects[index], count }))
      .filter((facet) => facet.name)
      .sort((left, right) => right.count - left.count);
  }, [levelPapers, subjects]);

  const subjectFacet = parsed.facets.find((facet) => facet.type === 'subject');
  const activeSubjectIndex = subjectFacet ? subjectFacet.value : null;

  useEffect(() => { setLimit(PAGE_SIZE); }, [query, selectedLevel, schoolFilter, onlyFilter, sortMode]);

  useEffect(() => {
    const target = sentinelRef.current;
    if (!target || typeof IntersectionObserver === 'undefined') return undefined;
    if (limit >= results.length) return undefined;

    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) {
        setLimit((current) => Math.min(current + PAGE_SIZE, results.length));
      }
    }, { rootMargin: '360px 0px', threshold: 0.01 });

    observer.observe(target);
    return () => observer.disconnect();
  }, [limit, results.length]);

  const visible = results.slice(0, limit);
  const activePaper = activeIdentity
    ? visible.find((paper) => getPaperIdentity(paper) === activeIdentity) || null
    : null;

  const ladderEntry = activePaper
    ? ladder.find((entry) => entry.subject === subjects[activePaper.s])
    : null;
  const suggestedAllowance = ladderEntry ? ladderEntry.allowance : getAllowanceForRung(1);
  const chosenAllowance = allowanceId || suggestedAllowance.id;

  const setSubjectFacet = (index) => {
    const facet = index === null
      ? null
      : { type: 'subject', value: index, label: subjects[index] };
    onQueryChange(withFacet(parsed, 'subject', facet));
  };

  const dropFacet = (type) => onQueryChange(withFacet(parsed, type, null));

  const changeLayout = (next) => {
    setLayout(next);
    try { localStorage.setItem('hsc_library_layout', next); }
    catch (error) { /* The choice simply resets next visit. */ }
  };

  const changeSort = (next) => {
    setSortMode(next);
    try { localStorage.setItem(SORT_STORAGE_KEY, next); }
    catch (error) { /* The choice simply resets next visit. */ }
  };

  const headingSubject = activeSubjectIndex !== null ? subjects[activeSubjectIndex] : 'All subjects';
  const activeSort = SORT_MODES.find((mode) => mode.id === sortMode) || SORT_MODES[0];

  return (
    <div className="library-view">
      <div className="library-search" style={{ padding: '22px var(--gutter) 10px' }}>
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
          <label style={{ position: 'relative', flex: '1 1 320px', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: '12px', display: 'flex', color: 'color-mix(in srgb, var(--color-text) 45%, transparent)' }}>
              <Search size={16} />
            </span>
            <input
              className="input"
              value={query}
              onChange={(event) => onQueryChange(event.target.value)}
              placeholder="chem trial 2019+ with solutions"
              style={{ paddingLeft: '36px', minHeight: '44px', fontSize: '16px', fontFamily: 'var(--font-heading)' }}
              aria-label="Search the library"
            />
          </label>
          <button type="button" className="btn btn-secondary" onClick={onAsk}>
            <Sparkles size={14} />
            Ask instead
          </button>
        </div>

        {(parsed.facets.length > 0 || parsed.terms.length > 0) && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', marginTop: '10px', flexWrap: 'wrap' }}>
            <span className="kick" style={{ letterSpacing: '0.1em' }}>Read as</span>
            {parsed.facets.map((facet) => (
              <button
                key={facet.type}
                type="button"
                className="tag tag-outline"
                onClick={() => dropFacet(facet.type)}
                title="Remove this filter"
              >
                {facet.label}
              </button>
            ))}
            {parsed.terms.map((term) => (
              <span key={term} className="tag tag-neutral">“{term}”</span>
            ))}
            <button type="button" className="btn btn-ghost" style={{ fontSize: '12px' }} onClick={() => onQueryChange('')}>
              Clear
            </button>
          </div>
        )}
      </div>

      <div className="library-grid">
        <aside className="pane-scroll" style={{ padding: '20px 24px 30px', borderRight: '1px solid var(--color-divider)', borderTop: '1px solid var(--color-divider)' }}>
          <div className="kick">Year</div>
          <div className="seg" style={{ margin: '8px 0 20px' }}>
            {[12, 11].map((level) => (
              <label key={level} className="seg-opt">
                <input
                  type="radio"
                  name="library-level"
                  checked={selectedLevel === level}
                  onChange={() => onLevelChange?.(level)}
                />
                <span>Year {level}</span>
              </label>
            ))}
          </div>

          <div className="kick">Subject</div>
          <div style={{ margin: '8px 0 20px' }}>
            {subjectFacets.slice(0, 8).map((facet) => (
              <button
                key={facet.index}
                type="button"
                className={`facet ${activeSubjectIndex === facet.index ? 'on' : ''}`}
                onClick={() => setSubjectFacet(activeSubjectIndex === facet.index ? null : facet.index)}
              >
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{facet.name}</span>
                <span className="num">{facet.count.toLocaleString()}</span>
              </button>
            ))}
            {subjectFacets.length > 8 && (
              <details style={{ marginTop: '6px' }}>
                <summary style={{ fontSize: '12px', cursor: 'pointer', color: 'var(--color-accent-700)' }}>
                  All {subjectFacets.length} subjects
                </summary>
                <div style={{ marginTop: '6px' }}>
                  {subjectFacets.slice(8).map((facet) => (
                    <button
                      key={facet.index}
                      type="button"
                      className={`facet ${activeSubjectIndex === facet.index ? 'on' : ''}`}
                      onClick={() => setSubjectFacet(activeSubjectIndex === facet.index ? null : facet.index)}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{facet.name}</span>
                      <span className="num">{facet.count.toLocaleString()}</span>
                    </button>
                  ))}
                </div>
              </details>
            )}
          </div>

          <div className="kick">School</div>
          <input
            className="input"
            placeholder="Filter schools"
            value={schoolFilter}
            onChange={(event) => setSchoolFilter(event.target.value)}
            style={{ margin: '8px 0 20px' }}
          />

          <div className="kick">Only show</div>
          <div style={{ marginTop: '8px', display: 'flex', flexDirection: 'column', gap: '7px' }}>
            {ONLY_FILTERS.map((filter) => (
              <label key={filter.id} className="radio">
                <input
                  type="radio"
                  name="library-only"
                  checked={onlyFilter === filter.id}
                  onChange={() => setOnlyFilter(filter.id)}
                />
                <span className="dot" />
                <span>{filter.label}</span>
              </label>
            ))}
          </div>
        </aside>

        <div className="library-index pane-scroll" style={{ padding: '20px var(--gutter) 30px', borderTop: '1px solid var(--color-divider)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '12px', gap: '12px' }}>
            <h4 style={{ margin: 0 }}>
              {headingSubject}{' '}
              <span className="num dim" style={{ fontFamily: 'var(--font-body)', fontSize: '12.5px' }}>
                — {results.length.toLocaleString()} papers, {activeSort.note}
              </span>
            </h4>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 'none', flexWrap: 'wrap' }}>
              <span className="sec-note">
                {layout === 'index' ? 'Select a row to start it' : 'Select a card to start it'}
              </span>

              <div className="seg" role="group" aria-label="Sort order">
                {SORT_MODES.map((mode) => (
                  <label key={mode.id} className="seg-opt" title={mode.note}>
                    <input
                      type="radio"
                      name="library-sort"
                      checked={sortMode === mode.id}
                      onChange={() => changeSort(mode.id)}
                    />
                    <span>{mode.label}</span>
                  </label>
                ))}
              </div>

              <div className="seg" role="group" aria-label="Library layout">
                {[
                  { id: 'index', label: 'Index', Icon: List },
                  { id: 'cards', label: 'Cards', Icon: LayoutGrid },
                ].map(({ id, label, Icon }) => (
                  <label key={id} className="seg-opt" title={`${label} view`}>
                    <input
                      type="radio"
                      name="library-layout"
                      checked={layout === id}
                      onChange={() => changeLayout(id)}
                    />
                    <Icon size={13} />
                    <span className="hide-narrow">{label}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>

          {layout === 'index' && (
            <div className="idxrow h" style={{ gridTemplateColumns: INDEX_COLUMNS }}>
              <span>№</span>
              <span>School &amp; year</span>
              <span className="hide-narrow">Type</span>
              <span className="hide-narrow">Time</span>
              <span className="hide-narrow">Sol.</span>
              <span className="hide-narrow">Sat</span>
              <span />
            </div>
          )}

          {visible.length === 0 && (
            <p className="dim" style={{ fontSize: '13px', padding: '18px 0' }}>
              Nothing in the index matches that. Try a shorter search, or clear a chip above.
            </p>
          )}

          {layout === 'cards' && visible.length > 0 && (
            <div className="paper-cards">
              {visible.map((paper) => {
                const identity = getPaperIdentity(paper);
                const isActive = identity === activeIdentity;
                const isSaved = bookmarks.has(`${paper.v}_${paper.n}`);
                const isSat = satPaperIds.has(identity);
                const timing = describeSubjectTiming(subjects[paper.s]);

                return (
                  <div
                    key={identity}
                    className={`paper-card-tile ${isActive ? 'on' : ''} ${isSat ? 'is-sat' : ''}`}
                    role="button"
                    tabIndex={0}
                    title={consensus.explain(paper, schools[paper.h])}
                    onClick={() => {
                      setActiveIdentity(isActive ? null : identity);
                      setAllowanceId(null);
                    }}
                    // A double click is how a list of documents is opened
                    // everywhere else, and it costs nothing to honour here.
                    onDoubleClick={() => onOpenPaper?.(paper)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') { onOpenPaper?.(paper); return; }
                      if (event.key !== ' ') return;
                      event.preventDefault();
                      setActiveIdentity(isActive ? null : identity);
                      setAllowanceId(null);
                    }}
                  >
                    <span className="paper-card-head">
                      <span className="card-kicker">{PAPER_TYPES[paper.c] || 'Paper'}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        className="paper-card-save"
                        aria-label={isSaved ? 'Remove from saved' : 'Save this paper'}
                        title={isSaved ? 'Remove from saved' : 'Save this paper'}
                        onClick={(event) => { event.stopPropagation(); onToggleBookmark?.(paper); }}
                        onKeyDown={(event) => {
                          if (event.key !== 'Enter' && event.key !== ' ') return;
                          event.preventDefault();
                          event.stopPropagation();
                          onToggleBookmark?.(paper);
                        }}
                        style={{ color: isSaved ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-text) 38%, transparent)' }}
                      >
                        <Bookmark size={14} />
                      </span>
                    </span>

                    <span className="paper-card-title">{schools[paper.h] || paper.n}</span>
                    <span className="num dim paper-card-year">{paper.y} · {subjects[paper.s]}</span>

                    <span className="paper-card-time num dim" title={timing.detail}>
                      <Clock size={12} />
                      {timing.label}
                    </span>

                    <span className="paper-card-foot">
                      {paper.w === 1 && <span className="tag tag-accent">Solutions</span>}
                      {isSat && <span className="tag tag-neutral">Sat</span>}
                      {!isSat && paper.w !== 1 && <span className="dim" style={{ fontSize: '11.5px' }}>No solutions</span>}
                      {/* The one affordance the card view was missing: a way
                          straight into the paper, without the quick-start bar. */}
                      <button
                        type="button"
                        className="btn btn-ghost paper-card-open"
                        onClick={(event) => { event.stopPropagation(); onOpenPaper?.(paper); }}
                        title="Open this paper"
                      >
                        Open
                      </button>
                    </span>
                  </div>
                );
              })}
            </div>
          )}

          {layout === 'cards' && (
            <QuickStart
              open={Boolean(activePaper)}
              paper={activePaper}
              docked
              subjects={subjects}
              schools={schools}
              isSat={activePaper ? satPaperIds.has(getPaperIdentity(activePaper)) : false}
              suggestedAllowance={suggestedAllowance}
              chosenAllowance={chosenAllowance}
              onAllowanceChange={setAllowanceId}
              onBegin={onBeginSitting}
              onOpen={onOpenPaper}
            />
          )}

          {layout === 'index' && visible.map((paper, position) => {
            const identity = getPaperIdentity(paper);
            const isActive = identity === activeIdentity;
            const isSaved = bookmarks.has(`${paper.v}_${paper.n}`);
            const isSat = satPaperIds.has(identity);
            const timing = describeSubjectTiming(subjects[paper.s]);

            return (
              <div key={identity}>
                <div
                  className="idxrow"
                  style={{
                    gridTemplateColumns: INDEX_COLUMNS,
                    background: isActive ? 'color-mix(in srgb, var(--color-text) 4%, transparent)' : undefined,
                  }}
                  role="button"
                  tabIndex={0}
                  title={consensus.explain(paper, schools[paper.h])}
                  onClick={() => {
                    setActiveIdentity(isActive ? null : identity);
                    setAllowanceId(null);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') onOpenPaper?.(paper);
                  }}
                >
                  <span className="num dim" style={{ fontSize: '12px' }}>{position + 1}</span>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    <span className="idxrow-title">{schools[paper.h] || paper.n}</span>{' '}
                    <span className="num dim">{paper.y}</span>
                  </span>
                  <span className="dim hide-narrow" style={{ fontSize: '12.5px' }}>{PAPER_TYPES[paper.c] || '—'}</span>
                  <span className="num dim hide-narrow" style={{ fontSize: '12.5px' }} title={timing.detail}>{timing.label}</span>
                  <span className="hide-narrow" style={{ fontSize: '14px', color: 'var(--color-accent)' }}>{paper.w === 1 ? '✓' : ''}</span>
                  <span className="num dim hide-narrow" style={{ fontSize: '12.5px' }}>{isSat ? 'Sat' : '—'}</span>
                  <span style={{ textAlign: 'right' }}>
                    <button
                      type="button"
                      className="btn btn-ghost"
                      title={isSaved ? 'Remove from saved' : 'Save this paper'}
                      aria-label={isSaved ? 'Remove from saved' : 'Save this paper'}
                      onClick={(event) => { event.stopPropagation(); onToggleBookmark?.(paper); }}
                      style={{ color: isSaved ? 'var(--color-accent)' : 'color-mix(in srgb, var(--color-text) 40%, transparent)' }}
                    >
                      <Bookmark size={14} />
                    </button>
                  </span>
                </div>

                {isActive && (
                  <QuickStart
                    open={isActive}
                    paper={paper}
                    subjects={subjects}
                    schools={schools}
                    isSat={isSat}
                    suggestedAllowance={suggestedAllowance}
                    chosenAllowance={chosenAllowance}
                    onAllowanceChange={setAllowanceId}
                    onBegin={onBeginSitting}
                    onOpen={onOpenPaper}
                  />
                )}
              </div>
            );
          })}

          <div ref={sentinelRef} />
          <p className="dim" style={{ fontSize: '12px', marginTop: '14px' }}>
            {limit < results.length
              ? `Showing ${visible.length.toLocaleString()} of ${results.length.toLocaleString()} · scroll to continue`
              : `All ${results.length.toLocaleString()} matching papers are listed.`}
          </p>
        </div>
      </div>
    </div>
  );
}
