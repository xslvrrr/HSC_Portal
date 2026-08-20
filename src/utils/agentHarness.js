/**
 * agentHarness.js
 *
 * Client-side agentic execution loop.
 * Manages the conversation history and repeatedly calls /api/agent-chat
 * until the model returns a final text response (no more tool calls).
 */

import { getPaperIdentity } from './paperIdentity.js';
import { findAgenticPaperMatches } from './agenticPaperSearch.js';
import { getOpenRouterRequestHeaders } from './openRouterKeySettings.js';
import { buildWeakSpots, chooseNextSubject, findAllowance, getAllowanceForRung } from './practiceLadder.js';
import { saveMistake } from './practiceRecords.js';

// ─── Tool Definitions (OpenAI function-calling schema) ────────────────────────

export const AGENT_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'search_papers',
      description: 'Search the HSC paper database and return matching papers. Use this whenever the user asks to find, search, show, or look up papers.',
      parameters: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'Natural language search query, e.g. "2022 Chemistry trial with solutions"',
          },
          limit: {
            type: 'number',
            description: 'Maximum number of results to return. Defaults to 10.',
          },
        },
        required: ['query'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_bookmarks',
      description: 'Returns a list of paper IDs that the student has currently bookmarked.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'bookmark_paper',
      description: 'Bookmarks a paper by its paper_id (the "viewno" field). Use after searching to find the right paper_id.',
      parameters: {
        type: 'object',
        properties: {
          paper_id: {
            type: 'string',
            description: 'The paper\'s unique identifier (v + "_" + n, as returned by search_papers)',
          },
          paper_name: {
            type: 'string',
            description: 'Human-readable name of the paper, for confirmation.',
          },
        },
        required: ['paper_id', 'paper_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'remove_bookmark',
      description: 'Removes a paper from bookmarks by its paper_id.',
      parameters: {
        type: 'object',
        properties: {
          paper_id: {
            type: 'string',
            description: 'The paper\'s unique identifier',
          },
          paper_name: {
            type: 'string',
            description: 'Human-readable name of the paper, for confirmation.',
          },
        },
        required: ['paper_id', 'paper_name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'add_calendar_event',
      description: 'Adds a study session, exam, or reminder to the calendar.',
      parameters: {
        type: 'object',
        properties: {
          title: {
            type: 'string',
            description: 'The event title, e.g. "Physics Study Session" or "Chemistry HSC Exam"',
          },
          date_string: {
            type: 'string',
            description: 'ISO 8601 date string, e.g. "2025-11-01" or "2025-11-01T16:00:00"',
          },
          description: {
            type: 'string',
            description: 'Optional notes or details for the event.',
          },
          color: {
            type: 'string',
            description: 'Optional color for the event. One of: "blue", "green", "red", "purple", "yellow", "orange"',
            enum: ['blue', 'green', 'red', 'purple', 'yellow', 'orange'],
          },
        },
        required: ['title', 'date_string'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_study_stats',
      description: 'Returns the student\'s study statistics: how many papers they\'ve viewed, completed, and bookmarked.',
      parameters: {
        type: 'object',
        properties: {},
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_ladder',
      description: 'Returns the practice ladder: every subject the student studies, its confidence rung (1-5), the time allowance that rung earns, and their most recent mark. Use this before giving any advice about difficulty, timing or what to practise.',
      parameters: { type: 'object', properties: {}, required: [] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'recommend_next_paper',
      description: 'Returns the paper the ladder would prescribe next, with the allowance it should be sat at. Prefer this over search_papers when the student asks what to do rather than what exists.',
      parameters: {
        type: 'object',
        properties: {
          subject: {
            type: 'string',
            description: 'Optional subject name to restrict the recommendation to.',
          },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_weak_topics',
      description: 'Returns the topics the student\'s logged mistakes cluster on, heaviest first. Use this to ground revision advice in what they actually got wrong.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'How many topics to return. Defaults to 6.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_upcoming_exams',
      description: 'Returns the student\'s upcoming written exams with the number of days until each one.',
      parameters: {
        type: 'object',
        properties: {
          limit: { type: 'number', description: 'How many exams to return. Defaults to 6.' },
        },
        required: [],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'log_mistake',
      description: 'Adds an entry to the student\'s mistake notebook. Only call this when the student has described a specific error they made and asked for it to be recorded.',
      parameters: {
        type: 'object',
        properties: {
          subject: { type: 'string', description: 'Subject the mistake belongs to.' },
          topic: { type: 'string', description: 'Topic, e.g. "Buffers and titration curves".' },
          question: { type: 'string', description: 'Question reference, e.g. "19" or "4(b)".' },
          category: {
            type: 'string',
            description: 'Type of error.',
            enum: ['Knowledge gap', 'Misread question', 'Method — wrong approach', 'Calculation slip', 'Time management', 'Exam technique', 'Other'],
          },
          note: { type: 'string', description: 'What went wrong, and the rule for next time.' },
        },
        required: ['subject', 'topic', 'note'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'begin_sitting',
      description: 'Opens a paper in the practice room with the clock already set to the given allowance. Use only when the student has clearly asked to start a paper now.',
      parameters: {
        type: 'object',
        properties: {
          paper_id: { type: 'string', description: 'The paper_id returned by search_papers or recommend_next_paper.' },
          allowance: {
            type: 'string',
            description: 'Time allowance to sit it at. Defaults to the allowance the ladder earns for that subject.',
            enum: ['untimed', 'plus20', 'plus10', 'toTime', 'minus10'],
          },
        },
        required: ['paper_id'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_section',
      description: 'Navigates the portal to one of its sections. Use when the student asks to go somewhere rather than asking a question.',
      parameters: {
        type: 'object',
        properties: {
          section: {
            type: 'string',
            enum: ['today', 'library', 'calendar', 'notebook', 'history', 'textbooks'],
          },
        },
        required: ['section'],
      },
    },
  },
];

// ─── Tool Executor ─────────────────────────────────────────────────────────────

/**
 * Executes a tool call locally with full access to React state.
 *
 * @param {string} toolName - The tool function name
 * @param {object} args - The parsed arguments from the model
 * @param {object} appContext - Live app state and callbacks passed from React
 * @returns {object} - The tool result object to append to conversation
 */
export async function executeTool(toolName, args, appContext) {
  const {
    papers = [],
    subjects = [],
    schools = [],
    bookmarks = new Set(),
    toggleBookmark,
    addCalendarEvent,
    selectedLevel,
    ladder = [],
    mistakes = [],
    exams = [],
    satPaperIds = new Set(),
    beginSitting,
    goToSection,
  } = appContext;

  /** Resolves the `v_n` id the search tools hand back to a real paper. */
  const findPaperById = (paperId) => {
    const split = String(paperId || '').indexOf('_');
    if (split === -1) return null;
    const v = String(paperId).slice(0, split);
    const n = String(paperId).slice(split + 1);
    return papers.find((paper) => String(paper.v) === v && paper.n === n) || null;
  };

  switch (toolName) {
    case 'search_papers': {
      const limit = typeof args.limit === 'number' ? Math.min(args.limit, 30) : 10;
      const result = findAgenticPaperMatches(
        args.query,
        papers,
        subjects,
        schools,
        { limit, defaultLevel: selectedLevel }
      );

      if (!result.applied || result.papers.length === 0) {
        return { found: 0, papers: [], summary: 'No papers matched the query.' };
      }

      // Return a simplified view of the papers (not full objects to save tokens)
      const simplified = result.papers.slice(0, limit).map(({ paper, score, reasons }) => ({
        paper_id: `${paper.v}_${paper.n}`,
        name: paper.n,
        subject: subjects[paper.s] || 'Unknown',
        school: schools[paper.h] || null,
        year: paper.y,
        category: paper.c === 'H' ? 'HSC Official' : paper.c === 'T' ? 'Trial' : 'Assessment',
        has_solutions: paper.w === 1,
        level: paper.l,
        score,
        reasons,
      }));

      return {
        found: result.total,
        returned: simplified.length,
        summary: result.summary,
        papers: simplified,
      };
    }

    case 'get_bookmarks': {
      const bookmarkedIds = Array.from(bookmarks);
      if (bookmarkedIds.length === 0) {
        return { count: 0, bookmarks: [], message: 'No papers are currently bookmarked.' };
      }

      // Resolve paper IDs to paper objects
      const resolved = bookmarkedIds.map((id) => {
        // paper_id format: v + "_" + n
        const underscoreIdx = id.indexOf('_');
        if (underscoreIdx === -1) return { paper_id: id, name: id };
        const v = id.substring(0, underscoreIdx);
        const n = id.substring(underscoreIdx + 1);
        const paper = papers.find((p) => String(p.v) === v && p.n === n);
        if (!paper) return { paper_id: id, name: n };
        return {
          paper_id: id,
          name: paper.n,
          subject: subjects[paper.s] || 'Unknown',
          year: paper.y,
          category: paper.c,
        };
      });

      return { count: resolved.length, bookmarks: resolved };
    }

    case 'bookmark_paper': {
      const { paper_id, paper_name } = args;
      if (!paper_id) return { success: false, error: 'No paper_id provided.' };

      if (bookmarks.has(paper_id)) {
        return { success: true, already_bookmarked: true, message: `"${paper_name}" is already bookmarked.` };
      }

      if (typeof toggleBookmark === 'function') {
        toggleBookmark(paper_id);
        return { success: true, message: `Bookmarked "${paper_name}".` };
      }

      return { success: false, error: 'Bookmark action not available.' };
    }

    case 'remove_bookmark': {
      const { paper_id, paper_name } = args;
      if (!paper_id) return { success: false, error: 'No paper_id provided.' };

      if (!bookmarks.has(paper_id)) {
        return { success: false, message: `"${paper_name}" is not currently bookmarked.` };
      }

      if (typeof toggleBookmark === 'function') {
        toggleBookmark(paper_id);
        return { success: true, message: `Removed bookmark for "${paper_name}".` };
      }

      return { success: false, error: 'Bookmark action not available.' };
    }

    case 'add_calendar_event': {
      const { title, date_string, description = '', color = 'blue' } = args;

      if (!title || !date_string) {
        return { success: false, error: 'Both title and date_string are required.' };
      }

      const date = new Date(date_string);
      if (isNaN(date.getTime())) {
        return { success: false, error: `Invalid date: "${date_string}". Use ISO 8601 format.` };
      }

      if (typeof addCalendarEvent === 'function') {
        addCalendarEvent({ title, date: date_string, description, color });
        return {
          success: true,
          message: `Added "${title}" to calendar on ${date.toLocaleDateString('en-AU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}.`,
        };
      }

      return { success: false, error: 'Calendar action not available.' };
    }

    case 'get_study_stats': {
      try {
        const viewed = JSON.parse(localStorage.getItem('hsc_viewed_papers') || '[]');
        const completed = JSON.parse(localStorage.getItem('hsc_completed_papers') || '[]');
        const bookmarkedCount = bookmarks.size;

        return {
          papers_viewed: Array.isArray(viewed) ? viewed.length : 0,
          papers_completed: Array.isArray(completed) ? completed.length : 0,
          papers_bookmarked: bookmarkedCount,
          total_papers_available: papers.length,
        };
      } catch {
        return { papers_viewed: 0, papers_completed: 0, papers_bookmarked: bookmarks.size };
      }
    }

    case 'get_ladder': {
      if (ladder.length === 0) {
        return { subjects: [], message: 'No subjects pinned yet, so the ladder is empty.' };
      }
      return {
        subjects: ladder.map((entry) => ({
          subject: entry.subject,
          rung: entry.rung,
          max_rung: 5,
          allowance: entry.allowance.label,
          sittings: entry.sittings,
          last_percent: entry.lastPercent,
          streak_above_holding_mark: entry.streak,
          self_reported: Boolean(entry.isSeeded),
        })),
      };
    }

    case 'recommend_next_paper': {
      if (ladder.length === 0) {
        return { success: false, message: 'No subjects pinned, so nothing can be prescribed yet.' };
      }

      const wanted = String(args.subject || '').trim().toLowerCase();
      const entry = (wanted && ladder.find((row) => row.subject.toLowerCase() === wanted))
        || chooseNextSubject(ladder);
      const subjectIndex = subjects.indexOf(entry.subject);

      const candidates = papers
        .filter((paper) => paper.s === subjectIndex
          && paper.l === selectedLevel
          && !satPaperIds.has(getPaperIdentity(paper)))
        .sort((left, right) => {
          const solutions = (right.w === 1 ? 1 : 0) - (left.w === 1 ? 1 : 0);
          if (solutions !== 0) return solutions;
          return (parseInt(String(right.y), 10) || 0) - (parseInt(String(left.y), 10) || 0);
        });

      if (candidates.length === 0) {
        return {
          success: false,
          subject: entry.subject,
          message: `Every ${entry.subject} paper at this year level has already been sat.`,
        };
      }

      const paper = candidates[0];
      return {
        success: true,
        subject: entry.subject,
        rung: entry.rung,
        allowance: entry.allowance.label,
        allowance_id: entry.allowance.id,
        reason: entry.sittings === 0
          ? 'No sittings logged for this subject yet, so it goes first.'
          : `Weakest current form on the ladder (rung ${entry.rung} of 5).`,
        paper: {
          paper_id: `${paper.v}_${paper.n}`,
          name: paper.n,
          school: schools[paper.h] || null,
          year: paper.y,
          has_solutions: paper.w === 1,
        },
        alternatives: candidates.slice(1, 4).map((option) => ({
          paper_id: `${option.v}_${option.n}`,
          name: option.n,
          school: schools[option.h] || null,
          year: option.y,
        })),
      };
    }

    case 'get_weak_topics': {
      const limit = typeof args.limit === 'number' ? Math.min(args.limit, 20) : 6;
      const spots = buildWeakSpots(mistakes, limit);
      if (spots.length === 0) {
        return { count: 0, topics: [], message: 'The mistake notebook is empty.' };
      }
      return {
        count: spots.length,
        total_mistakes_logged: mistakes.length,
        topics: spots.map((spot) => ({ topic: spot.topic, subject: spot.subject || null, wrong: spot.count })),
      };
    }

    case 'list_upcoming_exams': {
      const limit = typeof args.limit === 'number' ? Math.min(args.limit, 20) : 6;
      if (exams.length === 0) {
        return { count: 0, exams: [], message: 'No published written exams ahead for these subjects.' };
      }
      return {
        count: exams.length,
        exams: exams.slice(0, limit).map((exam) => ({
          subject: exam.label,
          date: exam.date,
          when: exam.when,
          days_away: exam.daysAway,
        })),
      };
    }

    case 'log_mistake': {
      const { subject, topic, question = '', category = 'Other', note } = args;
      if (!subject || !topic || !note) {
        return { success: false, error: 'subject, topic and note are all required.' };
      }
      try {
        saveMistake({
          paper: null,
          subjectName: subject,
          schoolName: '',
          mistake: { questionId: question, topic, category, note },
        });
        return { success: true, message: `Logged "${topic}" under ${subject} in the notebook.` };
      } catch (error) {
        return { success: false, error: error.message };
      }
    }

    case 'begin_sitting': {
      const paper = findPaperById(args.paper_id);
      if (!paper) return { success: false, error: `No paper matches id "${args.paper_id}".` };
      if (typeof beginSitting !== 'function') return { success: false, error: 'Starting a sitting is not available here.' };

      const ladderEntry = ladder.find((entry) => entry.subject === subjects[paper.s]);
      const fallback = ladderEntry ? ladderEntry.allowance : getAllowanceForRung(1);
      const allowance = findAllowance(args.allowance) || fallback;

      beginSitting(paper, allowance.id);
      return {
        success: true,
        message: `Opening ${paper.n} at ${allowance.label.toLowerCase()}.`,
        allowance: allowance.label,
      };
    }

    case 'open_section': {
      const section = String(args.section || '').trim();
      const allowed = ['today', 'library', 'calendar', 'notebook', 'history', 'textbooks'];
      if (!allowed.includes(section)) return { success: false, error: `Unknown section "${section}".` };
      if (typeof goToSection !== 'function') return { success: false, error: 'Navigation is not available here.' };
      goToSection(section);
      return { success: true, message: `Opened ${section}.` };
    }

    default:
      return { error: `Unknown tool: ${toolName}` };
  }
}

// ─── Agent Execution Loop ──────────────────────────────────────────────────────

const MAX_TURNS = 6; // prevent infinite loops

function buildActivePaperContext(appContext) {
  const activePaper = appContext?.currentPaper;
  if (!activePaper?.name) return '';

  const details = [
    'ACTIVE PAPER CONTEXT — this is the paper the student currently has open.',
    `Title: ${activePaper.name}`,
    `Subject: ${activePaper.subject || 'Unknown'}`,
    `School or source: ${activePaper.school || 'Unknown'}`,
    `Year level: ${activePaper.level || 'Unknown'}`,
    `Paper year: ${activePaper.year || 'Unknown'}`,
    `Paper type: ${activePaper.category || 'Unknown'}`,
    `Solutions available: ${activePaper.hasSolutions ? 'Yes' : 'No'}`,
  ];

  if (activePaper.textStatus === 'ready' && activePaper.text) {
    details.push(
      `Complete PDF text is supplied from pages 1–${activePaper.totalPages || activePaper.pageEnd || activePaper.pagesExtracted || 'available'}. You may use any included page, but distinguish the paper text from your own advice.`,
      `Complete paper text:\n${String(activePaper.text)}`,
    );
  } else {
    details.push(`PDF text is not available for this paper. ${activePaper.textReason || 'Use the paper metadata only and ask the student to paste an excerpt for question-specific help.'}`);
  }

  details.push('Use this context when it helps. Never claim that you can see text that is not included above.');
  return details.join('\n');
}

/**
 * Runs the full agentic execution loop.
 *
 * @param {string} userMessage - The user's request
 * @param {object} appContext - Live React state and callbacks
 * @param {object} options
 * @param {function} options.onStep - Called on each step: { type, label, data }
 * @param {AbortSignal} options.signal - Abort signal to cancel mid-run
 * @returns {Promise<{ answer: string, steps: Array }>}
 */
export async function runAgent(userMessage, appContext, { onStep, signal } = {}) {
  const steps = [];

  const emit = (step) => {
    steps.push(step);
    if (typeof onStep === 'function') onStep(step);
  };

  const activePaperContext = buildActivePaperContext(appContext);
  const requestContent = activePaperContext
    ? `${activePaperContext}\n\nSTUDENT REQUEST:\n${userMessage}`
    : userMessage;

  const messages = [
    { role: 'user', content: requestContent },
  ];

  emit({ type: 'thinking', label: 'Thinking…' });

  for (let turn = 0; turn < MAX_TURNS; turn++) {
    if (signal?.aborted) {
      throw new DOMException('Agent was cancelled.', 'AbortError');
    }

    let response;
    try {
      response = await fetch('/api/agent-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...getOpenRouterRequestHeaders(appContext?.openRouterSettings),
        },
        signal,
        body: JSON.stringify({
          messages,
          tools: AGENT_TOOLS,
          tool_choice: 'auto',
        }),
      });
    } catch (err) {
      if (err.name === 'AbortError') throw err;
      throw new Error(`Network error: ${err.message}`);
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `API error ${response.status}`);
    }

    const completion = await response.json();
    const message = completion?.choices?.[0]?.message;

    if (!message) {
      throw new Error('No response from agent.');
    }

    // Always push the assistant message to the conversation
    messages.push(message);

    // ── Case 1: Model wants to call tools ──
    if (message.tool_calls && message.tool_calls.length > 0) {
      for (const toolCall of message.tool_calls) {
        const toolName = toolCall.function?.name;
        let toolArgs = {};
        try {
          toolArgs = JSON.parse(toolCall.function?.arguments || '{}');
        } catch {
          // keep empty args
        }

        emit({
          type: 'tool_call',
          label: formatToolLabel(toolName, toolArgs),
          tool: toolName,
          args: toolArgs,
        });

        let toolResult;
        try {
          toolResult = await executeTool(toolName, toolArgs, appContext);
        } catch (err) {
          toolResult = { error: err.message };
        }

        emit({
          type: 'tool_result',
          label: formatToolResultLabel(toolName, toolResult),
          tool: toolName,
          result: toolResult,
        });

        // Append tool result to conversation
        messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: JSON.stringify(toolResult),
        });
      }

      // Continue the loop so the model can respond with the results
      emit({ type: 'thinking', label: 'Processing results…' });
      continue;
    }

    // ── Case 2: Final text response ──
    const answer = message.content?.trim();
    if (answer) {
      emit({ type: 'answer', label: answer });
      return { answer, steps };
    }

    // Edge case: empty content and no tool calls
    throw new Error('Agent returned an empty response.');
  }

  throw new Error('Agent reached maximum turns without a final response.');
}

// ─── Label Formatters ──────────────────────────────────────────────────────────

function formatToolLabel(toolName, args) {
  switch (toolName) {
    case 'search_papers':
      return `Searching for "${args.query}"…`;
    case 'get_bookmarks':
      return 'Fetching your bookmarks…';
    case 'bookmark_paper':
      return `Bookmarking "${args.paper_name}"…`;
    case 'remove_bookmark':
      return `Removing bookmark for "${args.paper_name}"…`;
    case 'add_calendar_event':
      return `Adding "${args.title}" to calendar…`;
    case 'get_study_stats':
      return 'Checking your study statistics…';
    case 'get_ladder':
      return 'Reading your ladder…';
    case 'recommend_next_paper':
      return args.subject ? `Choosing a ${args.subject} paper…` : 'Choosing your next paper…';
    case 'get_weak_topics':
      return 'Reading your mistake notebook…';
    case 'list_upcoming_exams':
      return 'Checking your exam timetable…';
    case 'log_mistake':
      return `Logging "${args.topic}"…`;
    case 'begin_sitting':
      return 'Opening the paper…';
    case 'open_section':
      return `Opening ${args.section}…`;
    default:
      return `Running ${toolName}…`;
  }
}

function formatToolResultLabel(toolName, result) {
  switch (toolName) {
    case 'search_papers':
      if (result.found === 0) return 'No matching papers found.';
      return `Found ${result.found} paper${result.found === 1 ? '' : 's'} — showing top ${result.returned}.`;
    case 'get_bookmarks':
      return `You have ${result.count} bookmarked paper${result.count === 1 ? '' : 's'}.`;
    case 'bookmark_paper':
      return result.success ? result.message : `Failed: ${result.error}`;
    case 'remove_bookmark':
      return result.success ? result.message : `Failed: ${result.error || result.message}`;
    case 'add_calendar_event':
      return result.success ? result.message : `Failed: ${result.error}`;
    case 'get_study_stats':
      return `${result.papers_completed} completed, ${result.papers_viewed} viewed, ${result.papers_bookmarked} bookmarked.`;
    case 'get_ladder':
      return result.subjects?.length
        ? `${result.subjects.length} subject${result.subjects.length === 1 ? '' : 's'} on the ladder.`
        : 'The ladder is empty.';
    case 'recommend_next_paper':
      return result.success
        ? `${result.subject} — ${result.paper.name} at ${String(result.allowance).toLowerCase()}.`
        : (result.message || 'Nothing to prescribe.');
    case 'get_weak_topics':
      return result.count ? `${result.count} topic${result.count === 1 ? '' : 's'} worth revisiting.` : 'No mistakes logged.';
    case 'list_upcoming_exams':
      return result.count ? `${result.count} exam${result.count === 1 ? '' : 's'} ahead.` : 'No exams found.';
    case 'log_mistake':
    case 'begin_sitting':
    case 'open_section':
      return result.success ? result.message : `Failed: ${result.error}`;
    default:
      return result.success ? 'Done.' : (result.error || 'Unknown result.');
  }
}
