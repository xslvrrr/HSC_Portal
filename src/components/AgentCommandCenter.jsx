import { useState, useRef, useEffect, useCallback } from 'react';
import { runAgent } from '../utils/agentHarness.js';
import { resolveLocally } from '../utils/localAgent.js';
import { usePresence } from '../utils/usePresence.js';
import { useEscapeKey } from '../utils/useEscapeKey.js';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// ─── Icons (inline SVG to avoid extra dependencies) ───────────────────────────

const IconSend = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M22 2L11 13" /><path d="M22 2L15 22 11 13 2 9l20-7z" />
  </svg>
);

const IconStop = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
    <rect x="4" y="4" width="16" height="16" rx="2" />
  </svg>
);

const IconSparkle = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z" />
  </svg>
);

const IconClear = () => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

// ─── Step type configs ─────────────────────────────────────────────────────────

const STEP_CONFIG = {
  thinking: { icon: '🧠', className: 'agent-step-thinking' },
  tool_call: { icon: '⚡', className: 'agent-step-tool-call' },
  tool_result: { icon: '✓', className: 'agent-step-tool-result' },
  answer: { icon: '💬', className: 'agent-step-answer' },
  error: { icon: '⚠', className: 'agent-step-error' },
};

// ─── Formatted assistant answers ───────────────────────────────────────────────

function normaliseMathDelimiters(content) {
  return String(content || '')
    .replace(/\\\[(.*?)\\\]/gs, (_, math) => '$$' + math + '$$')
    .replace(/\\\((.*?)\\\)/gs, (_, math) => '$' + math + '$');
}

function FormattedAssistantAnswer({ content }) {
  return (
    <div className="agent-markdown">
      <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>
        {normaliseMathDelimiters(content)}
      </ReactMarkdown>
    </div>
  );
}

// ─── Step Component ────────────────────────────────────────────────────────────

function AgentStep({ step, isLast }) {
  const config = STEP_CONFIG[step.type] || { icon: '•', className: '' };
  return (
    <div className={`agent-step ${config.className} ${isLast && step.type === 'thinking' ? 'agent-step-pulse' : ''}`}>
      <span className="agent-step-icon">{config.icon}</span>
      <span className="agent-step-label">{step.label}</span>
    </div>
  );
}

// ─── Suggestion Pills ──────────────────────────────────────────────────────────

const SUGGESTIONS = [
  'Find 2023 Chemistry trials with solutions',
  'Show my bookmarks',
  'Add a Physics study session for next Monday',
  'What are my study stats?',
  'Find recent Maths Ext 2 papers',
];

// ─── Main Component ────────────────────────────────────────────────────────────

/**
 * AgentCommandCenter
 *
 * A premium chat-style interface for the agentic AI harness.
 * Props:
 *   - appContext: { papers, subjects, schools, bookmarks, toggleBookmark, addCalendarEvent, selectedLevel }
 *   - isOpen: boolean
 *   - onClose: function
 */
export default function AgentCommandCenter({ appContext, isOpen, onClose }) {
  const [input, setInput] = useState('');
  const presence = usePresence(isOpen, 260);

  // Every other overlay in the portal closes on Escape; this one did not.
  useEscapeKey(isOpen, onClose);
  const [conversation, setConversation] = useState([]);
  const [steps, setSteps] = useState([]);
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);
  const [selectedPaper, setSelectedPaper] = useState(null);
  const [paperPickerOpen, setPaperPickerOpen] = useState(false);
  const [paperQuery, setPaperQuery] = useState('');
  const abortRef = useRef(null);
  const inputRef = useRef(null);
  const logRef = useRef(null);

  const effectiveAppContext = selectedPaper
    ? { ...appContext, currentPaper: selectedPaper }
    : appContext;

  const selectPaperForAI = async (paper) => {
    if (!paper?.v || !paper?.n) return;

    const paperMetadata = {
      name: paper.n,
      subject: appContext?.subjects?.[paper.s] || 'Unknown subject',
      school: appContext?.schools?.[paper.h] || 'Unknown source',
      level: `Year ${paper.l || 'Unknown'}`,
      year: paper.y || 'Unknown',
      category: paper.c === 'H' ? 'Official HSC' : paper.c === 'T' ? 'School trial' : paper.c === 'A' ? 'Assessment task' : 'Resource',
      hasSolutions: paper.w === 1,
      textStatus: 'loading',
      textReason: '',
      pagesExtracted: 0,
      pageStart: 0,
      pageEnd: 0,
      totalPages: 0,
      text: '',
    };

    setSelectedPaper(paperMetadata);
    setPaperPickerOpen(false);
    setPaperQuery('');
    handleClear();

    try {
      const response = await fetch(`/api/agent/paper-context?paperId=${encodeURIComponent(paper.v)}&paperName=${encodeURIComponent(paper.n)}`);
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error || 'The selected paper could not be prepared.');

      setSelectedPaper({
        ...paperMetadata,
        textStatus: payload.status || 'unavailable',
        textReason: payload.reason || '',
        pagesExtracted: payload.pagesExtracted || 0,
        pageStart: payload.pageStart || 0,
        pageEnd: payload.pageEnd || 0,
        totalPages: payload.totalPages || 0,
        text: payload.text || '',
      });
    } catch (error) {
      setSelectedPaper({
        ...paperMetadata,
        textStatus: 'unavailable',
        textReason: error.message || 'The selected paper could not be prepared.',
      });
    }
  };

  const useOpenPaperForAI = () => {
    setSelectedPaper(null);
    setPaperPickerOpen(false);
    setPaperQuery('');
    handleClear();
  };

  // Auto-scroll to latest step
  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [steps]);

  // Focus input on open
  useEffect(() => {
    if (isOpen && inputRef.current) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isOpen]);

  const handleSubmit = useCallback(async (query) => {
    const trimmed = (query || input).trim();
    if (!trimmed || isRunning) return;

    setConversation((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    setHasRun(true);

    // Answer from local data when we can. Most questions are lookups, and this
    // path costs no request, no key and no waiting.
    const local = resolveLocally(trimmed, effectiveAppContext);
    if (local) {
      setSteps([{ type: 'tool_result', label: 'Answered from your own data — no model call.' }]);
      setConversation((prev) => [...prev, { role: 'assistant', content: local.answer }]);
      if (local.navigate) effectiveAppContext?.goToSection?.(local.navigate);
      window.setTimeout(() => setSteps([]), 1200);
      return;
    }

    setSteps([{ type: 'thinking', label: 'Starting agent…' }]);
    setIsRunning(true);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const result = await runAgent(trimmed, effectiveAppContext, {
        signal: controller.signal,
        onStep: (step) => {
          setSteps((prev) => {
            // Replace the last "thinking" step if this is a non-thinking step (avoid doubles)
            const last = prev[prev.length - 1];
            if (last?.type === 'thinking' && step.type !== 'thinking') {
              return [...prev.slice(0, -1), step];
            }
            // Replace the last "thinking" step with the new one (only show one at a time)
            if (last?.type === 'thinking' && step.type === 'thinking') {
              return [...prev.slice(0, -1), step];
            }
            return [...prev, step];
          });
        },
      });

      setConversation((prev) => [...prev, { role: 'assistant', content: result.answer }]);
      setSteps([]);
    } catch (err) {
      if (err.name !== 'AbortError') {
        setConversation((prev) => [...prev, { role: 'error', content: err.message || 'Something went wrong.' }]);
        setSteps((prev) => [
          ...prev.filter((s) => s.type !== 'thinking'),
          { type: 'error', label: err.message || 'Something went wrong.' },
        ]);
      }
    } finally {
      setIsRunning(false);
      abortRef.current = null;
    }
  }, [input, isRunning, effectiveAppContext]);

  const handleStop = () => {
    abortRef.current?.abort();
    setIsRunning(false);
    setSteps((prev) => [
      ...prev.filter((s) => s.type !== 'thinking'),
      { type: 'error', label: 'Stopped by user.' },
    ]);
  };

  const handleClear = () => {
    setConversation([]);
    setSteps([]);
    setHasRun(false);
    setInput('');
    inputRef.current?.focus();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
    if (e.key === 'Escape') {
      onClose?.();
    }
  };

  if (!presence.mounted) return null;

  const hasError = steps.some((s) => s.type === 'error');
  const lastStepIdx = steps.length - 1;
  const hasConversation = conversation.length > 0;
  const activePaper = selectedPaper || appContext?.currentPaper;
  const paperSearchQuery = paperQuery.trim().toLowerCase();
  const paperChoices = (appContext?.papers || [])
    .filter((paper) => {
      if (!paperSearchQuery) return true;
      const subject = appContext?.subjects?.[paper.s] || '';
      const school = appContext?.schools?.[paper.h] || '';
      return [paper.n, subject, school, String(paper.y || '')]
        .join(' ')
        .toLowerCase()
        .includes(paperSearchQuery);
    })
    .slice(0, 16);
  const suggestions = activePaper ? [
    'Give me a short plan for this paper',
    'What should I focus on while doing this paper?',
    'How should I approach this paper under timed conditions?',
    'How should I review this paper afterwards?',
  ] : SUGGESTIONS;

  return (
    <>
      {/* Backdrop */}
      <div
        className={`agent-backdrop is-${presence.stage}`}
        onClick={onClose}
        aria-label="Close Agent"
        role="button"
        tabIndex={-1}
      />

      {/* Panel */}
      <div className={`agent-panel is-${presence.stage}`} role="dialog" aria-modal="true" aria-label="AI Agent Command Center">
        {/* Header */}
        <div className="agent-header">
          <div className="agent-header-title">
            <span className="agent-sparkle-icon"><IconSparkle /></span>
            <div>
              <div className="agent-title">AI Agent</div>
              <div className="agent-subtitle">{activePaper ? 'Paper-aware study support' : 'Ask me to search, bookmark, or schedule'}</div>
            </div>
          </div>
          <div className="agent-header-actions">
            {hasRun && (
              <button className="agent-action-btn" onClick={handleClear} title="Clear conversation" aria-label="Clear">
                <IconClear />
                <span>Clear</span>
              </button>
            )}
            <button className="agent-close-btn" onClick={onClose} aria-label="Close">
              <IconClear />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="agent-body">
          <div style={{ margin: '14px 18px 0', padding: '10px 12px', borderRadius: '10px', background: 'var(--bg-tertiary)', border: '1px solid var(--bg-modifier-accent)', fontSize: '12px', lineHeight: 1.45, color: 'var(--text-muted)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--brand-experiment)' }}>Paper shared with AI</div>
              <button type="button" className="agent-action-btn" onClick={() => setPaperPickerOpen((open) => !open)} style={{ fontSize: '11px', padding: '4px 7px' }}>
                {paperPickerOpen ? 'Close chooser' : 'Choose paper'}
              </button>
            </div>

            {activePaper ? (
              <>
                <div style={{ color: 'var(--text-normal)', fontWeight: 650, marginTop: '5px' }}>{activePaper.name}</div>
                <div>{activePaper.subject || 'Unknown subject'} · {activePaper.year || 'Unknown year'} · {activePaper.category || 'Resource'}</div>
                <div style={{ marginTop: '4px' }}>
                  {activePaper.textStatus === 'ready'
                    ? `Full paper ready: pages 1–${activePaper.totalPages || activePaper.pageEnd || activePaper.pagesExtracted || 'available'} are available to the AI.`
                    : activePaper.textStatus === 'loading'
                      ? 'Reading the complete paper for the AI…'
                      : `Paper details are available, but full text could not be prepared. ${activePaper.textReason || ''}`}
                </div>
                {selectedPaper && appContext?.currentPaper && (
                  <button type="button" className="agent-action-btn" onClick={useOpenPaperForAI} style={{ marginTop: '8px', fontSize: '11px', padding: '4px 7px' }}>
                    Use currently open paper instead
                  </button>
                )}
              </>
            ) : (
              <div style={{ marginTop: '5px' }}>No paper is currently shared. Choose a paper to give the AI complete paper context.</div>
            )}

            {paperPickerOpen && (
              <div style={{ marginTop: '10px', paddingTop: '10px', borderTop: '1px solid var(--bg-modifier-accent)' }}>
                <input
                  autoFocus
                  type="search"
                  value={paperQuery}
                  onChange={(event) => setPaperQuery(event.target.value)}
                  placeholder="Search by title, subject, school, or year"
                  aria-label="Search papers to share with the AI"
                  style={{ width: '100%', boxSizing: 'border-box', padding: '8px 9px', borderRadius: '7px', border: '1px solid var(--bg-modifier-accent)', background: 'var(--bg-primary)', color: 'var(--text-normal)', fontSize: '12px' }}
                />
                <div style={{ marginTop: '7px', maxHeight: '180px', overflowY: 'auto', display: 'grid', gap: '4px' }}>
                  {paperChoices.map((paper) => (
                    <button
                      key={`${paper.v}-${paper.n}`}
                      type="button"
                      onClick={() => selectPaperForAI(paper)}
                      style={{ textAlign: 'left', padding: '7px 8px', border: '1px solid var(--bg-modifier-accent)', borderRadius: '7px', background: 'var(--bg-primary)', color: 'var(--text-normal)', cursor: 'pointer', fontSize: '12px' }}
                    >
                      <strong style={{ display: 'block', fontWeight: 650 }}>{paper.n}</strong>
                      <span style={{ color: 'var(--text-muted)' }}>{appContext?.subjects?.[paper.s] || 'Unknown subject'} · {paper.y || 'Unknown year'} · {appContext?.schools?.[paper.h] || 'Unknown source'}</span>
                    </button>
                  ))}
                  {paperChoices.length === 0 && <div style={{ padding: '8px 0' }}>No papers match that search.</div>}
                </div>
              </div>
            )}
          </div>
          {/* Conversation History */}
          {hasConversation ? (
            <div className="agent-log" ref={logRef}>
              <div className="agent-chat-history">
                {conversation.map((message, idx) => (
                  <div
                    key={`${message.role}-${idx}`}
                    className={`agent-message agent-message-${message.role}`}
                  >
                    <div className="agent-message-label">
                      {message.role === 'user' ? 'You' : message.role === 'assistant' ? 'AI Agent' : 'Error'}
                    </div>
                    <div className="agent-message-bubble">
                      {message.role === 'assistant'
                        ? <FormattedAssistantAnswer content={message.content} />
                        : message.content}
                    </div>
                  </div>
                ))}
              </div>

              {isRunning && steps.length > 0 && (
                <div className="agent-log-steps">
                  {steps.map((step, idx) => (
                    <AgentStep
                      key={idx}
                      step={step}
                      isLast={idx === lastStepIdx}
                    />
                  ))}
                </div>
              )}

              {hasError && !isRunning && (
                <div className="agent-error-notice">
                  <span>⚠</span>
                  <span>{steps.find(s => s.type === 'error')?.label}</span>
                </div>
              )}
            </div>
          ) : (
            /* Empty state — suggestions */
            <div className="agent-empty">
              <div className="agent-empty-icon"><IconSparkle /></div>
              <p className="agent-empty-title">What can I help with?</p>
              <p className="agent-empty-sub">{activePaper ? 'I can use this open paper to help you plan, approach, and review your practice.' : 'I can search papers, manage bookmarks, and add calendar events.'}</p>
              <div className="agent-suggestions">
                {suggestions.map((s) => (
                  <button
                    key={s}
                    className="agent-suggestion-pill"
                    onClick={() => handleSubmit(s)}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Input */}
        <div className="agent-input-area">
          <textarea
            ref={inputRef}
            id="agent-command-input"
            className="agent-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={activePaper ? 'Ask about this paper…' : 'Ask me anything…'}
            rows={1}
            disabled={isRunning}
            aria-label="Agent command input"
          />
          <div className="agent-input-actions">
            {isRunning ? (
              <button
                className="agent-stop-btn"
                onClick={handleStop}
                title="Stop agent"
                aria-label="Stop"
              >
                <IconStop />
                <span>Stop</span>
              </button>
            ) : (
              <button
                className="agent-send-btn"
                onClick={() => handleSubmit()}
                disabled={!input.trim()}
                title="Send"
                aria-label="Send"
              >
                <IconSend />
              </button>
            )}
          </div>
        </div>

        {/* Footer note */}
        <div className="agent-footer-note">
          Powered by OpenRouter · Actions run locally in your browser
        </div>
      </div>
    </>
  );
}
