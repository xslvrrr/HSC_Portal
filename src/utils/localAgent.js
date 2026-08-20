/**
 * Local intent router.
 *
 * Most of what students ask the agent is a lookup, not a language problem:
 * "what should I sit", "how long until Chemistry", "what am I bad at". Those
 * are answered here, from data already in the browser — no OpenRouter call, no
 * key, no latency, and no chance of an invented paper.
 *
 * Anything this file cannot answer confidently returns null, and the caller
 * falls through to the model.
 */

import { buildWeakSpots, chooseNextSubject } from './practiceLadder';
import { parseLibraryQuery, applyLibraryQuery, PAPER_TYPES } from './libraryQuery';
import { getPaperIdentity } from './paperIdentity';
import { AGENT_GREETING, AGENT_NO_MATCH, daySeed, pick } from './copyPool';

const MAX_LISTED = 6;

function normalise(text) {
  return String(text || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function paperLine(paper, { subjects, schools }) {
  const bits = [
    schools[paper.h] || paper.n,
    paper.y,
    '—',
    subjects[paper.s],
  ].filter(Boolean).join(' ');
  const tail = [PAPER_TYPES[paper.c], paper.w === 1 ? 'solutions' : 'no solutions']
    .filter(Boolean)
    .join(' · ');
  return `- **${bits}** — ${tail}`;
}

/** Finds the subject the question is about, if it names one. */
function subjectFromText(text, subjects) {
  const parsed = parseLibraryQuery(text, { subjects });
  const facet = parsed.facets.find((entry) => entry.type === 'subject');
  return facet ? subjects[facet.value] : null;
}

// ── Intents ─────────────────────────────────────────────────────────────────

const INTENTS = [
  {
    id: 'greeting',
    test: (text) => matchesAny(text, [/^(hi|hey|hello|yo|sup)\b/, /^what can you do/, /^help$/]),
    run: () => ({
      answer: [
        pick(AGENT_GREETING, daySeed()),
        '',
        'Things I can answer without calling out to a model:',
        '- what to sit next, and at what allowance',
        '- your ladder, rung by rung',
        '- the topics your mistakes keep landing on',
        '- days until any of your written exams',
        '- any search of the paper index',
      ].join('\n'),
    }),
  },

  {
    id: 'next_paper',
    test: (text) => matchesAny(text, [
      /what (should|do) i (sit|do|practise|practice|study)/,
      /what('s| is) next/,
      /next paper/,
      /recommend .*(paper|sitting)/,
      /pick (me )?a paper/,
    ]),
    run: (text, context) => {
      const { ladder = [], papers = [], subjects = [], schools = [], selectedLevel = 12, satPaperIds = new Set() } = context;
      if (ladder.length === 0) {
        return { answer: 'No subjects pinned yet. Open customisation or the setup questionnaire and choose what you study — then I can prescribe a paper.' };
      }

      const named = subjectFromText(text, subjects);
      const entry = named
        ? ladder.find((row) => row.subject === named) || chooseNextSubject(ladder)
        : chooseNextSubject(ladder);

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

      const lines = [
        `**${entry.subject}** — rung ${entry.rung} of 5, so the allowance is **${entry.allowance.label.toLowerCase()}**.`,
      ];

      if (candidates.length === 0) {
        lines.push('', 'You have sat every paper the index holds for that subject at this year level. Try the other year, or drill a weak topic instead.');
      } else {
        lines.push('', 'Unsat papers, newest first:', ...candidates.slice(0, 3).map((paper) => paperLine(paper, { subjects, schools })));
      }

      return { answer: lines.join('\n') };
    },
  },

  {
    id: 'ladder',
    test: (text) => matchesAny(text, [/my ladder/, /\brungs?\b/, /(my )?allowances?/, /how am i (doing|going)/, /my (form|progress)/]),
    run: (_text, context) => {
      const { ladder = [] } = context;
      if (ladder.length === 0) return { answer: 'Your ladder is empty — no subjects pinned yet.' };

      const rows = ladder.map((entry) => {
        const last = entry.lastPercent === null ? 'no marks yet' : `last ${entry.lastPercent}%`;
        const seeded = entry.isSeeded ? ' (self-reported)' : '';
        return `- **${entry.subject}** — rung ${entry.rung}/5${seeded}, offers ${entry.allowance.label.toLowerCase()}, ${last}`;
      });

      return { answer: ['Your ladder as it stands:', '', ...rows].join('\n') };
    },
  },

  {
    id: 'weak_topics',
    test: (text) => matchesAny(text, [
      /weak (spots?|topics?|areas?)/,
      /what am i (bad|worst) at/,
      /keep getting wrong/,
      /my mistakes/,
      /what should i revise/,
    ]),
    run: (_text, context) => {
      const spots = buildWeakSpots(context.mistakes || [], MAX_LISTED);
      if (spots.length === 0) {
        return { answer: 'Nothing in the notebook yet. Log mistakes when you review a sitting and they will group into topics here.' };
      }
      return {
        answer: [
          'The topics your mistakes keep landing on:',
          '',
          ...spots.map((spot) => `- **${spot.topic}** — ${spot.count} wrong${spot.subject ? ` · ${spot.subject}` : ''}`),
          '',
          'Worth an untimed, open-book hour each before your next full paper.',
        ].join('\n'),
      };
    },
  },

  {
    id: 'exam_countdown',
    test: (text) => matchesAny(text, [
      /how (long|many days)/,
      /when is (my|the)/,
      /days (until|till|to)/,
      /exam date/,
      /my exams?/,
      /timetable/,
    ]),
    run: (text, context) => {
      const { exams = [], subjects = [] } = context;
      if (exams.length === 0) return { answer: 'No published written exams ahead for your subjects.' };

      const named = subjectFromText(text, subjects);
      const matching = named
        ? exams.filter((exam) => normalise(exam.label).includes(normalise(named).split(' ')[0]))
        : exams;
      const list = (matching.length > 0 ? matching : exams).slice(0, MAX_LISTED);

      return {
        answer: [
          named && matching.length > 0 ? `${named} written exams:` : 'Your next written exams:',
          '',
          ...list.map((exam) => `- **${exam.label}** — ${exam.daysAway} day${exam.daysAway === 1 ? '' : 's'} · ${exam.when}`),
        ].join('\n'),
      };
    },
  },

  {
    id: 'bookmarks',
    test: (text) => matchesAny(text, [/my (bookmarks|saved)/, /show .*(bookmark|saved)/, /what have i saved/]),
    run: (_text, context) => {
      const { bookmarks = new Set(), papers = [], subjects = [], schools = [] } = context;
      if (bookmarks.size === 0) return { answer: 'Nothing saved yet. The bookmark control sits at the end of every index row.' };

      const resolved = [...bookmarks]
        .map((key) => {
          const split = key.indexOf('_');
          if (split === -1) return null;
          const v = key.slice(0, split);
          const n = key.slice(split + 1);
          return papers.find((paper) => String(paper.v) === v && paper.n === n) || null;
        })
        .filter(Boolean);

      if (resolved.length === 0) return { answer: `You have ${bookmarks.size} saved paper(s), but none of them are in the current index.` };

      return {
        answer: [
          `${resolved.length} saved paper${resolved.length === 1 ? '' : 's'}:`,
          '',
          ...resolved.slice(0, MAX_LISTED).map((paper) => paperLine(paper, { subjects, schools })),
        ].join('\n'),
      };
    },
  },

  {
    id: 'stats',
    test: (text) => matchesAny(text, [/my (stats|statistics|numbers)/, /how many papers have i/, /how much have i (done|sat)/]),
    run: (_text, context) => {
      const { reviews = [], mistakes = [], bookmarks = new Set(), satPaperIds = new Set(), papers = [] } = context;
      const marked = reviews.filter((review) => review.score !== null && review.totalMarks);
      const average = marked.length > 0
        ? Math.round(marked.reduce((sum, review) => sum + (review.score / review.totalMarks) * 100, 0) / marked.length)
        : null;

      return {
        answer: [
          `- **${satPaperIds.size}** paper${satPaperIds.size === 1 ? '' : 's'} sat, of ${papers.length.toLocaleString()} in the index`,
          `- **${reviews.length}** review${reviews.length === 1 ? '' : 's'} logged${average === null ? '' : `, averaging **${average}%**`}`,
          `- **${mistakes.length}** mistake${mistakes.length === 1 ? '' : 's'} in the notebook`,
          `- **${bookmarks.size}** paper${bookmarks.size === 1 ? '' : 's'} saved`,
        ].join('\n'),
      };
    },
  },

  {
    id: 'textbooks',
    test: (text) => matchesAny(text, [/textbook/, /\btext books?\b/, /reference material/]),
    run: () => ({
      answer: 'Textbooks live in the shared Drive folder — open the **Textbooks** section in the rail and it loads in place.',
      navigate: 'textbooks',
    }),
  },

  {
    id: 'search',
    test: (text) => matchesAny(text, [
      /^(find|search|show|list|get) /,
      /papers? (for|from|on|in)\b/,
      /^(any|are there) .*(papers?|trials?)/,
    ]),
    run: (text, context) => {
      const { papers = [], subjects = [], schools = [], selectedLevel = 12 } = context;
      const parsed = parseLibraryQuery(text, { subjects });

      // Only claim this intent when something concrete was understood.
      if (parsed.facets.length === 0) return null;

      const pool = papers.filter((paper) => paper.l === selectedLevel);
      const results = applyLibraryQuery(pool, parsed, { subjects, schools })
        .sort((left, right) => (parseInt(String(right.y), 10) || 0) - (parseInt(String(left.y), 10) || 0));

      if (results.length === 0) return { answer: pick(AGENT_NO_MATCH, text) };

      return {
        answer: [
          `**${results.length.toLocaleString()}** match${results.length === 1 ? '' : 'es'} — read as ${parsed.facets.map((facet) => facet.label).join(' · ')}.`,
          '',
          ...results.slice(0, MAX_LISTED).map((paper) => paperLine(paper, { subjects, schools })),
          results.length > MAX_LISTED ? `\nThe rest are in the library under the same search.` : '',
        ].filter(Boolean).join('\n'),
        query: text,
      };
    },
  },
];

/**
 * Tries to answer without the language model.
 *
 * @param {string} message
 * @param {object} context live app state
 * @returns {{ answer: string, intent: string, navigate?: string, query?: string }|null}
 */
export function resolveLocally(message, context = {}) {
  const text = normalise(message);
  if (!text) return null;

  for (const intent of INTENTS) {
    if (!intent.test(text)) continue;
    let result;
    try {
      result = intent.run(text, context);
    } catch (error) {
      // A broken shortcut should never block the model from trying.
      result = null;
    }
    if (result && result.answer) return { ...result, intent: intent.id };
  }

  return null;
}
