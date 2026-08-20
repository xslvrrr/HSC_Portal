import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  BookOpen,
  Check,
  ClipboardCheck,
  Feather,
  ListChecks,
  PanelBottomOpen,
  Share2,
  Trash2,
  X,
} from 'lucide-react';

import { getPaperIdentity } from '../utils/paperIdentity';
import { useAuth } from './AuthContext';
import PracticeReviewModal from './PracticeReviewModal';
import PdfDocument from './pdf/PdfDocument';
import AnnotationToolbar from './pdf/AnnotationToolbar';
import ExamTimerBar from './pdf/ExamTimerBar';
import PaperMargin from './pdf/PaperMargin';
import { analysePaperMetadata, createEmptyPaperMetadata, getPaperMetadata } from '../utils/paperMetadata';
import {
  DEFAULT_ANNOTATION_COLOR,
  HIGHLIGHT_DEFAULT_COLOR,
  loadAnnotations,
  saveAnnotations,
} from '../utils/annotations';
import { useAnnotationHistory } from '../utils/useAnnotationHistory';
import {
  createExamTimer,
  formatClock,
  readTimer,
  setDuration,
  setReadingTime,
  totalSeconds as timerTotal,
} from '../utils/examTimer';
import { usePdfZoom } from '../utils/usePdfZoom';
import { usePresence } from '../utils/usePresence';
import { parsePaperTiming, describeTiming } from '../utils/paperTiming';

const TIMER_STORAGE_KEY = 'hsc_timer_duration_secs';
const SCALE_STEP = 1.2;
const METADATA_POLL_ATTEMPTS = 12;
const METADATA_POLL_MIN_SECONDS = 5;

/** Data sheets NESA supplies in the exam room, mirrored here for the same courses. */
function getFormulaSheet(subject) {
  if (!subject) return null;
  const name = subject.toLowerCase();
  if (name.includes('physics')) return '/sheets/physics-data-sheet.pdf';
  if (name.includes('chemistry')) return '/sheets/chemistry-data-sheet.pdf';
  if (name.includes('earth') || name.includes('environmental')) return '/sheets/earth-env-science-sheet.pdf';
  if (name.includes('math')) {
    return name.includes('standard')
      ? '/sheets/maths-standard-reference.pdf'
      : '/sheets/mathematics-reference.pdf';
  }
  return null;
}

/**
 * The practice room.
 *
 * The paper is rendered by the portal rather than handed to the browser's PDF
 * plug-in, so it can carry annotations, obey one zoom control, and sit on the
 * paper ground. Two bars float over it: the exam timer, and the annotation
 * toolbar — both ported from the Millennium reader and reset in this type.
 */
export default function PracticeRoom({
  paper,
  subjectName,
  schoolName,
  onClose,
  onSharePaper,
  agentContext = {},
}) {
  const paperKey = getPaperIdentity(paper);
  const { user } = useAuth();

  // ── Timer ────────────────────────────────────────────────────────────────
  const [timer, setTimer] = useState(() => {
    // The allowance chosen when the sitting was begun is written here by the
    // library and Today, so the room opens on the clock the ladder earned.
    const stored = parseInt(localStorage.getItem(TIMER_STORAGE_KEY) || '', 10);
    return createExamTimer(Number.isFinite(stored) && stored >= 300 ? stored : 3 * 3600);
  });

  const elapsedSeconds = readTimer(timer, Date.now()).elapsedSeconds;

  // ── Annotations ──────────────────────────────────────────────────────────
  const [annotations, setAnnotations] = useState(() => loadAnnotations(paper));
  const [tool, setTool] = useState('select');
  // Ink and highlighter are different pens and remember different colours; a
  // highlighter loaded with near-black ink is just a grey smear.
  const [color, setColor] = useState(DEFAULT_ANNOTATION_COLOR);
  const [highlightColor, setHighlightColor] = useState(HIGHLIGHT_DEFAULT_COLOR);
  const isHighlighting = tool === 'highlight';
  const activeColor = isHighlighting ? highlightColor : color;
  const [strokeWidth, setStrokeWidth] = useState(2);
  const [selectedId, setSelectedId] = useState(null);
  const [toolsHidden, setToolsHidden] = useState(false);
  const [selectionText, setSelectionText] = useState('');
  const [widestPage, setWidestPage] = useState(0);
  const [detectedTiming, setDetectedTiming] = useState(null);

  const viewportRef = useRef(null);
  const contentRef = useRef(null);
  const zoom = usePdfZoom(viewportRef, contentRef, 1.1);
  const toolbar = usePresence(!toolsHidden, 220);
  const reveal = usePresence(toolsHidden, 180);

  useEffect(() => {
    setAnnotations(loadAnnotations(paper));
    setSelectedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [paperKey]);

  const applyAnnotations = useCallback((next) => {
    setAnnotations(next);
    saveAnnotations(paper, next);
  }, [paper]);

  const history = useAnnotationHistory(paperKey, annotations, applyAnnotations);

  const selectedAnnotation = annotations.find((item) => item.id === selectedId) || null;
  const textEditRef = useRef(null);

  const removeSelected = useCallback(() => {
    if (!selectedId) return;
    history.commit(annotations.filter((item) => item.id !== selectedId));
    setSelectedId(null);
  }, [annotations, history, selectedId]);

  // Delete removes the selected mark, Escape drops the selection. Ignored while
  // a field has focus, so typing a note never deletes it.
  useEffect(() => {
    const handleKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (event.key === 'Escape') { setSelectedId(null); return; }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (!selectedId) return;
        event.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [removeSelected, selectedId]);

  // Tool letters and the standard zoom shortcuts. Skipped while a field has
  // focus, so typing a note never re-arms the eraser.
  useEffect(() => {
    const SHORTCUTS = { v: 'select', h: 'hand', d: 'draw', g: 'highlight', l: 'line', a: 'arrow', t: 'text', e: 'eraser' };

    const handleKeyDown = (event) => {
      const tag = event.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;

      if (event.metaKey || event.ctrlKey) {
        if (event.key === '+' || event.key === '=') { event.preventDefault(); zoom.zoomBy(SCALE_STEP); }
        else if (event.key === '-') { event.preventDefault(); zoom.zoomBy(1 / SCALE_STEP); }
        else if (event.key === '0') { event.preventDefault(); zoom.fitToWidth(widestPage); }
        else if (event.key === '.') { event.preventDefault(); setToolsHidden((hidden) => !hidden); }
        else if (event.key.toLowerCase() === 'z') {
          event.preventDefault();
          if (event.shiftKey) history.redo(); else history.undo();
        }
        return;
      }

      const next = SHORTCUTS[event.key?.toLowerCase()];
      if (next) { event.preventDefault(); setTool(next); }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [history, widestPage, zoom]);

  // ── Paper context and structure ──────────────────────────────────────────
  const [paperContext, setPaperContext] = useState({
    status: 'loading', text: '', pagesExtracted: 0, pageStart: 0, pageEnd: 0, totalPages: 0, reason: '',
  });
  const [paperMetadata, setPaperMetadata] = useState(() => createEmptyPaperMetadata());
  const [isRequestingMetadata, setIsRequestingMetadata] = useState(false);
  const [actionMessage, setActionMessage] = useState('');
  const [isCompleted, setIsCompleted] = useState(false);
  const [isReviewOpen, setIsReviewOpen] = useState(false);
  const [isMarginOpen, setIsMarginOpen] = useState(false);
  const [showFormula, setShowFormula] = useState(false);
  const [mobileTab, setMobileTab] = useState('paper');
  const actionTimerRef = useRef(null);

  const sheetUrl = getFormulaSheet(subjectName);

  const [pendingQuestion, setPendingQuestion] = useState('');

  /**
   * The paper states its own reading and working allowance on the first page.
   * When it does, and the student has not already started, the timer adopts it —
   * a detected time beats both the default and the ladder's generic guess.
   */
  const handleDocumentLoaded = useCallback(({ widestPage: widest, firstPageText }) => {
    setWidestPage(widest);
    zoom.fitToWidth(widest);

    const timing = parsePaperTiming(firstPageText);
    if (timing.source !== 'document') return;
    setDetectedTiming(timing);

    setTimer((current) => {
      if (current.status !== 'idle') return current;
      let next = current;
      if (timing.workingMinutes) next = setDuration(next, timing.workingMinutes * 60);
      if (timing.readingMinutes) next = setReadingTime(next, timing.readingMinutes * 60);
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom.fitToWidth]);

  const flash = useCallback((message, duration = 2200) => {
    setActionMessage(message);
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
    actionTimerRef.current = setTimeout(() => setActionMessage(''), duration);
  }, []);

  useEffect(() => () => {
    if (actionTimerRef.current) clearTimeout(actionTimerRef.current);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    setPaperContext({ status: 'loading', text: '', pagesExtracted: 0, pageStart: 0, pageEnd: 0, totalPages: 0, reason: '' });

    fetch(`/api/agent/paper-context?paperId=${encodeURIComponent(paper.v)}&paperName=${encodeURIComponent(paper.n)}`, {
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'The complete paper could not be prepared.');
        return payload;
      })
      .then((payload) => {
        setPaperContext({
          status: payload.status || 'unavailable',
          text: payload.text || '',
          pagesExtracted: payload.pagesExtracted || 0,
          pageStart: payload.pageStart || 0,
          pageEnd: payload.pageEnd || 0,
          totalPages: payload.totalPages || 0,
          reason: payload.reason || '',
        });
      })
      .catch((error) => {
        if (error.name === 'AbortError') return;
        setPaperContext({
          status: 'unavailable', text: '', pagesExtracted: 0, pageStart: 0, pageEnd: 0, totalPages: 0,
          reason: error.message || 'The complete paper could not be prepared.',
        });
      });

    return () => controller.abort();
  }, [paper.v, paper.n, paperKey]);

  useEffect(() => {
    let isActive = true;
    setPaperMetadata(createEmptyPaperMetadata());

    getPaperMetadata(paper)
      .then((metadata) => { if (isActive) setPaperMetadata(metadata); })
      .catch((error) => {
        if (isActive) setPaperMetadata({ ...createEmptyPaperMetadata('missing'), error: error.message || 'Paper structure could not be loaded.' });
      });

    return () => { isActive = false; };
  }, [paperKey, paper]);

  // An analysis claimed by this or another reader finishes on the server. Poll the
  // shared cache until it lands instead of asking the student to press Refresh.
  useEffect(() => {
    if (paperMetadata.status !== 'analysing') return undefined;

    let isActive = true;
    let attempts = 0;
    const delayMs = Math.max(paperMetadata.retryAfterSeconds || 10, METADATA_POLL_MIN_SECONDS) * 1000;

    const timer = setInterval(() => {
      attempts += 1;
      if (attempts > METADATA_POLL_ATTEMPTS) {
        clearInterval(timer);
        return;
      }

      getPaperMetadata(paper)
        .then((metadata) => {
          if (!isActive || metadata.status === 'analysing') return;
          clearInterval(timer);
          setPaperMetadata(metadata);
          if (metadata.status === 'ready') flash('Question structure is ready');
        })
        .catch(() => {
          // A single failed poll is not fatal; the next tick tries again.
        });
    }, delayMs);

    return () => { isActive = false; clearInterval(timer); };
  }, [paperMetadata.status, paperMetadata.retryAfterSeconds, paper, flash]);

  const handleAnalysePaperMetadata = async () => {
    if (paperMetadata.status === 'analysing') {
      setIsRequestingMetadata(true);
      try {
        const metadata = await getPaperMetadata(paper);
        setPaperMetadata(metadata);
        flash(metadata.status === 'ready' ? 'Question structure is ready' : 'Analysis is still running. Try again shortly.');
      } catch (error) {
        flash('Could not refresh the analysis');
      } finally {
        setIsRequestingMetadata(false);
      }
      return;
    }

    if (!user) {
      flash('Sign in to analyse and save this paper structure');
      return;
    }

    setIsRequestingMetadata(true);
    setPaperMetadata((current) => ({ ...current, status: 'analysing', error: '' }));
    try {
      const token = await user.getIdToken();
      const metadata = await analysePaperMetadata(paper, token);
      setPaperMetadata(metadata);
      flash(metadata.status === 'analysing' ? 'Analysis has started. Check again shortly.' : 'Question structure is ready');
    } catch (error) {
      setPaperMetadata({ ...createEmptyPaperMetadata('missing'), error: error.message || 'Paper structure could not be analysed.' });
      flash('Could not analyse this paper');
    } finally {
      setIsRequestingMetadata(false);
    }
  };

  // Record that this paper was opened.
  useEffect(() => {
    try {
      const key = 'hsc_viewed_papers';
      const stored = JSON.parse(localStorage.getItem(key) || '[]');
      const entry = { key: paperKey, v: paper.v, n: paper.n, s: paper.s, h: paper.h, y: paper.y, dateViewed: Date.now() };
      const filtered = (stored || []).filter((item) => String(item.key || item.v) !== paperKey);
      localStorage.setItem(key, JSON.stringify([entry, ...filtered].slice(0, 200)));
      window.dispatchEvent(new CustomEvent('hsc:history-updated'));
    } catch (error) {
      // History is a convenience; storage failures must not block the sitting.
    }
  }, [paperKey, paper]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('hsc_completed_papers') || '[]') || [];
      setIsCompleted(stored.some((item) => (
        String(item.paperId || item.paperIdLegacy || item.v) === paperKey
        || String(item.paperId || item.paperIdLegacy || item.v) === String(paper.v)
      )));
    } catch (error) {
      setIsCompleted(false);
    }
  }, [paperKey, paper.v]);

  const handleMarkCompleted = () => {
    try {
      const key = 'hsc_completed_papers';
      const stored = JSON.parse(localStorage.getItem(key) || '[]') || [];
      const entry = {
        id: `${paperKey}_${Date.now()}`,
        paperId: paperKey,
        paperIdLegacy: paper.v,
        paperName: paper.n,
        subjectName,
        schoolName,
        dateCompleted: Date.now(),
        timeSpent: elapsedSeconds,
        status: 'Completed',
      };
      const index = stored.findIndex((item) => (
        String(item.paperId || item.paperIdLegacy || item.v) === paperKey
        || String(item.paperId || item.paperIdLegacy || item.v) === String(paper.v)
      ));
      if (index >= 0) stored[index] = { ...stored[index], ...entry };
      else stored.unshift(entry);

      localStorage.setItem(key, JSON.stringify(stored.slice(0, 500)));
      setIsCompleted(true);
      setIsReviewOpen(true);
      window.dispatchEvent(new CustomEvent('hsc:history-updated'));
      flash('Marked complete — add your review', 1800);
    } catch (error) {
      flash('Could not mark this paper complete', 1800);
    }
  };

  const handleUnmarkCompleted = () => {
    try {
      const key = 'hsc_completed_papers';
      const stored = (JSON.parse(localStorage.getItem(key) || '[]') || []).filter((item) => (
        String(item.paperId || item.paperIdLegacy || item.v) !== paperKey
        && String(item.paperId || item.paperIdLegacy || item.v) !== String(paper.v)
      ));
      localStorage.setItem(key, JSON.stringify(stored));
      setIsCompleted(false);
      window.dispatchEvent(new CustomEvent('hsc:history-updated'));
      flash('Marked incomplete', 1800);
    } catch (error) {
      flash('Could not update this paper', 1800);
    }
  };

  // ── The paper source ─────────────────────────────────────────────────────
  // Papers with a Cloudflare path are real PDFs and render in the portal's own
  // viewer. Anything else only exists behind the legacy viewer page, which is
  // HTML — it stays in a frame rather than being passed to pdf.js as a PDF.
  const pdfUrl = paper?.cf ? `https://hscportal.pages.dev/${encodeURI(paper.cf)}` : null;
  const legacyUrl = `https://thsconline.github.io/s/viewer.html?field=${encodeURIComponent(paper?.n ?? '')}&base=${paper?.v ?? ''}`;

  const paperCategory = paper.c === 'H' ? 'Official HSC'
    : paper.c === 'T' ? 'School trial'
      : paper.c === 'A' ? 'Assessment task' : 'Resource';

  const marginContext = useMemo(() => ({
    ...agentContext,
    currentPaper: {
      name: paper.n,
      subject: subjectName,
      school: schoolName,
      level: `Year ${paper.l}`,
      year: paper.y,
      category: paperCategory,
      hasSolutions: paper.w === 1,
      textStatus: paperContext.status,
      textReason: paperContext.reason,
      pagesExtracted: paperContext.pagesExtracted,
      pageStart: paperContext.pageStart,
      pageEnd: paperContext.pageEnd,
      totalPages: paperContext.totalPages,
      text: paperContext.text,
      structure: {
        status: paperMetadata.status,
        questionCount: paperMetadata.questionCount,
        totalMarks: paperMetadata.totalMarks,
        questions: paperMetadata.questions,
      },
    },
  }), [agentContext, paper, subjectName, schoolName, paperCategory, paperContext, paperMetadata]);

  const ladderEntry = (agentContext.ladder || []).find((entry) => entry.subject === subjectName) || null;

  return (
    <div className="reader">
      <header className="reader-head">
        <button type="button" className="btn btn-secondary" onClick={onClose}>
          <ArrowLeft size={14} />
          Library
        </button>

        <div className="reader-title">
          <div className="kick">
            {subjectName} · {paperCategory}{paper.w === 1 ? ' · Solutions' : ''}
          </div>
          <div className="reader-name">{schoolName || paper.n} {paper.y}</div>
        </div>

        <div className="reader-actions">
          {sheetUrl && (
            <button
              type="button"
              className={`btn ${showFormula ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setShowFormula((open) => !open)}
              title="Show the data sheet beside the paper"
            >
              <BookOpen size={14} />
              Data sheet
            </button>
          )}

          <button
            type="button"
            className={`btn ${isMarginOpen ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setIsMarginOpen((open) => !open)}
            title="Ask about this paper"
          >
            <Feather size={14} />
            Margin
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleAnalysePaperMetadata}
            disabled={isRequestingMetadata}
            title={paperMetadata.status === 'ready'
              ? 'Question and mark structure is saved for every student'
              : paperMetadata.error || 'Read the questions and marks out of this paper once'}
          >
            <ListChecks size={14} />
            {paperMetadata.status === 'ready'
              ? `${paperMetadata.questionCount} questions${paperMetadata.totalMarks !== null ? ` · ${paperMetadata.totalMarks} marks` : ''}`
              : isRequestingMetadata ? 'Reading…'
                : paperMetadata.status === 'analysing' ? 'Reading…'
                  : paperMetadata.error ? 'Retry structure'
                    : 'Read structure'}
          </button>

          {onSharePaper && (
            <button type="button" className="btn btn-secondary btn-icon" onClick={onSharePaper} title="Share this paper" aria-label="Share this paper">
              <Share2 size={14} />
            </button>
          )}

          <button type="button" className="btn btn-secondary" onClick={() => setIsReviewOpen(true)} title="Review this sitting">
            <ClipboardCheck size={14} />
            Review
          </button>

          {isCompleted ? (
            <button type="button" className="btn btn-secondary" onClick={handleUnmarkCompleted}>
              <X size={14} />
              Sat
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={handleMarkCompleted}>
              <Check size={14} />
              Mark sat
            </button>
          )}
        </div>
      </header>

      {actionMessage && <div className="reader-notice">{actionMessage}</div>}

      <div className="reader-body">
        <div className={`reader-panes ${showFormula && sheetUrl ? 'is-split' : ''}`}>
          <div className={`reader-pane ${mobileTab === 'paper' ? 'is-active' : ''}`}>
            {pdfUrl ? (
              <PdfDocument
                url={pdfUrl}
                zoom={zoom}
                tool={tool}
                color={activeColor}
                strokeWidth={strokeWidth}
                annotations={annotations}
                onCommit={history.commit}
                onDirectChange={applyAnnotations}
                selectedId={selectedId}
                onSelectedIdChange={setSelectedId}
                onDocumentLoaded={handleDocumentLoaded}
                onSelectionChange={setSelectionText}
                viewportRef={viewportRef}
                contentRef={contentRef}
              />
            ) : (
              <iframe className="reader-frame" src={legacyUrl} title="Exam paper" />
            )}

            {toolbar.mounted && (
            <div className={`reader-bars is-${toolbar.stage} ${isMarginOpen ? 'is-shifted' : ''}`}>
              {selectionText && (
                <div className="selection-bar">
                  <span className="kick">Selected</span>
                  <span className="selection-quote">“{selectionText.slice(0, 90)}{selectionText.length > 90 ? '…' : ''}”</span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => { setPendingQuestion(selectionText); setIsMarginOpen(true); }}
                  >
                    <Feather size={14} />
                    Ask AI about this
                  </button>
                </div>
              )}

              {selectedAnnotation && (
                <div className="mark-editor">
                  {selectedAnnotation.kind === 'text' ? (
                    <input
                      ref={textEditRef}
                      className="input"
                      value={selectedAnnotation.text || ''}
                      aria-label="Annotation text"
                      placeholder="Note"
                      onChange={(event) => {
                        const next = annotations.map((item) => (
                          item.id === selectedId ? { ...item, text: event.target.value } : item
                        ));
                        // One history entry for the whole edit, not one per keystroke.
                        if (textEditRef.current === document.activeElement) applyAnnotations(next);
                        else history.commit(next);
                      }}
                    />
                  ) : (
                    <span className="dim" style={{ fontSize: '12.5px' }}>
                      {selectedAnnotation.kind} selected
                    </span>
                  )}
                  <button type="button" className="tool-btn" onClick={removeSelected} title="Delete this mark" aria-label="Delete this mark">
                    <Trash2 size={15} />
                  </button>
                </div>
              )}

              <ExamTimerBar
                state={timer}
                onStateChange={setTimer}
                durationSource={detectedTiming ? 'document' : ladderEntry ? 'ladder' : 'manual'}
                sourceDetail={detectedTiming ? describeTiming(detectedTiming) : null}
                suggestedReadingMinutes={detectedTiming?.readingMinutes || 0}
                onFinished={() => flash('Pens down. Open the review while it is fresh.', 6000)}
              />

              {pdfUrl && (
                <AnnotationToolbar
                  tool={tool}
                  onToolChange={setTool}
                  color={activeColor}
                  onColorChange={isHighlighting ? setHighlightColor : setColor}
                  palette={isHighlighting ? 'highlight' : 'ink'}
                  strokeWidth={strokeWidth}
                  onStrokeWidthChange={setStrokeWidth}
                  scale={zoom.liveScale}
                  minScale={zoom.minScale}
                  maxScale={zoom.maxScale}
                  isRasterStale={zoom.isRasterStale}
                  onZoom={(direction) => zoom.zoomBy(direction > 0 ? SCALE_STEP : 1 / SCALE_STEP)}
                  onFitWidth={() => zoom.fitToWidth(widestPage)}
                  canUndo={history.canUndo}
                  canRedo={history.canRedo}
                  onUndo={history.undo}
                  onRedo={history.redo}
                  onHide={() => setToolsHidden(true)}
                />
              )}
            </div>
            )}

            {reveal.mounted && (
              <button
                type="button"
                className={`reader-reveal is-${reveal.stage}`}
                onClick={() => setToolsHidden(false)}
                aria-label="Show the tools"
                title="Show the tools"
              >
                <PanelBottomOpen size={16} />
                <span className="num">{formatClock(readTimer(timer, Date.now()).phaseRemainingSeconds)}</span>
              </button>
            )}
          </div>

          {showFormula && sheetUrl && (
            <div className={`reader-pane reader-pane-sheet ${mobileTab === 'formula' ? 'is-active' : ''}`}>
              <iframe className="reader-frame" src={sheetUrl} title="Data sheet" />
            </div>
          )}
        </div>

        {showFormula && sheetUrl && (
          <div className="reader-tabs">
            <div className="seg">
              {[{ id: 'paper', label: 'Paper' }, { id: 'formula', label: 'Data sheet' }].map((entry) => (
                <label key={entry.id} className="seg-opt">
                  <input
                    type="radio"
                    name="reader-pane"
                    checked={mobileTab === entry.id}
                    onChange={() => setMobileTab(entry.id)}
                  />
                  <span>{entry.label}</span>
                </label>
              ))}
            </div>
          </div>
        )}
      </div>

      <PaperMargin
        isOpen={isMarginOpen}
        onClose={() => setIsMarginOpen(false)}
        paper={paper}
        subjectName={subjectName}
        appContext={marginContext}
        quotedText={pendingQuestion}
        onQuoteConsumed={() => setPendingQuestion('')}
      />

      {isReviewOpen && (
        <PracticeReviewModal
          paper={paper}
          subjectName={subjectName}
          schoolName={schoolName}
          metadata={paperMetadata}
          timeSpent={elapsedSeconds}
          allowanceLabel={ladderEntry ? ladderEntry.allowance.label.toLowerCase() : formatClock(timerTotal(timer))}
          onClose={() => setIsReviewOpen(false)}
          onSaved={(_, mistakeCount) => {
            flash(mistakeCount
              ? `Review saved with ${mistakeCount} mistake${mistakeCount === 1 ? '' : 's'}`
              : 'Review saved');
          }}
        />
      )}
    </div>
  );
}
