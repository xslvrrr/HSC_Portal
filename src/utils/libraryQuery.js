/**
 * Library query parsing.
 *
 * The reworked library has one search field and shows what it understood as a
 * row of "Read as" chips underneath: `chem trial 2019+ with solutions` becomes
 * Chemistry · School trial · 2019–2026 · Solutions included. Anything the
 * parser does not recognise stays as a plain text term and is matched against
 * the paper metadata as before.
 */

const CURRENT_YEAR = new Date().getFullYear();
const EARLIEST_YEAR = 1990;

/** Category codes as they appear in papers.json. */
export const PAPER_TYPES = {
  H: 'Official HSC',
  T: 'School trial',
  A: 'Assessment task',
  O: 'Other resource',
};

const TYPE_WORDS = [
  { code: 'T', words: ['trial', 'trials'] },
  { code: 'H', words: ['hsc', 'official'] },
  { code: 'A', words: ['assessment', 'task', 'tasks'] },
  { code: 'O', words: ['other', 'resource', 'resources'] },
];

const SOLUTION_WORDS = {
  with: ['solutions', 'solution', 'sol', 'sols', 'answers', 'worked'],
  without: ['nosol', 'nosolutions', 'unsolved'],
};

/**
 * Short forms students actually type, resolved against the subject names this
 * portal actually carries. Each value is matched case-insensitively against the
 * subject list, so an alias for a subject the index does not hold is ignored.
 */
const SUBJECT_ALIASES = {
  chem: 'chemistry',
  bio: 'biology',
  phys: 'physics',
  eco: 'economics',
  econ: 'economics',
  bus: 'business studies',
  legal: 'legal studies',
  ag: 'agriculture',
  modern: 'modern history',
  ancient: 'ancient history',
  'eng adv': 'english advanced',
  'eng std': 'english standard',
  'eng ext 1': 'english ext 1',
  'ext 1': 'maths ext 1',
  'ext 2': 'maths ext 2',
  '2u': 'maths (2u)',
  'general maths': 'general maths',
  sor: 'studies of religion 1',
  vis: 'visual arts',
  ipt: 'ipt',
  pdhpe: 'pdhpe',
};

function normalise(value) {
  return String(value || '')
    .toLowerCase()
    // "ext1" and "ext 1" are the same subject; keep them one shape.
    .replace(/\bext\s*(\d)/g, 'ext $1')
    .replace(/[^a-z0-9+\- ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * One lookup of every phrase that names a subject: the subject names
 * themselves plus the aliases that resolve to a subject this index holds.
 */
function buildSubjectLookup(subjects) {
  const byKey = new Map();

  subjects.forEach((name, index) => {
    const key = normalise(name);
    if (key) byKey.set(key, { name, index, key });
  });

  Object.entries(SUBJECT_ALIASES).forEach(([alias, target]) => {
    const aliasKey = normalise(alias);
    if (byKey.has(aliasKey)) return;
    const wanted = normalise(target);
    const match = [...byKey.values()].find((entry) => entry.key === wanted)
      || [...byKey.values()].find((entry) => entry.key.startsWith(wanted));
    if (match) byKey.set(aliasKey, match);
  });

  return byKey;
}

/**
 * Matches the longest run of tokens that names a subject, so "english advanced"
 * lands on English Advanced rather than letting the single word "english" pick
 * whichever English subject happens to sort shortest.
 */
function matchSubjectPhrase(tokens, index, lookup, minSpan = 1) {
  for (let span = Math.min(5, tokens.length - index); span >= minSpan; span -= 1) {
    const phrase = tokens.slice(index, index + span).join(' ');
    const match = lookup.get(phrase);
    if (match) return { subject: match, span };
  }
  return null;
}

/** Last resort for a single word: the shortest subject name it prefixes. */
function matchSubjectPrefix(term, lookup) {
  if (term.length < 3) return null;

  const candidates = [...new Set(lookup.values())]
    .filter((entry) => entry.key.startsWith(term) || entry.key.includes(` ${term}`));

  if (candidates.length === 0) return null;
  return candidates.sort((left, right) => left.key.length - right.key.length)[0];
}

function readYearToken(token) {
  const openEnded = token.match(/^(\d{4})\+$/);
  if (openEnded) {
    const from = Number(openEnded[1]);
    if (from >= EARLIEST_YEAR && from <= CURRENT_YEAR) return { from, to: CURRENT_YEAR };
  }

  const range = token.match(/^(\d{4})-(\d{4})$/);
  if (range) {
    const from = Number(range[1]);
    const to = Number(range[2]);
    if (from >= EARLIEST_YEAR && to <= CURRENT_YEAR && from <= to) return { from, to };
  }

  const single = token.match(/^(\d{4})$/);
  if (single) {
    const year = Number(single[1]);
    if (year >= EARLIEST_YEAR && year <= CURRENT_YEAR) return { from: year, to: year };
  }

  return null;
}

/**
 * @param {string} query raw search text
 * @param {{ subjects?: string[] }} context
 * @returns {{ facets: Array<object>, terms: string[] }}
 */
export function parseLibraryQuery(query, { subjects = [] } = {}) {
  const tokens = normalise(query).split(' ').filter(Boolean);
  const lookup = buildSubjectLookup(subjects);
  const facets = [];
  const terms = [];
  let index = 0;

  const has = (type) => facets.some((facet) => facet.type === type);
  const takeSubject = (match, span) => {
    facets.push({ type: 'subject', value: match.index, label: match.name });
    index += span;
  };

  while (index < tokens.length) {
    const token = tokens[index];
    const next = tokens[index + 1];

    // Multi-word subject names win over every other reading of their words.
    if (!has('subject')) {
      const phrase = matchSubjectPhrase(tokens, index, lookup, 2);
      if (phrase) {
        takeSubject(phrase.subject, phrase.span);
        continue;
      }
    }

    // "with solutions" / "no solutions" read as a pair before the single words do.
    if ((token === 'with' || token === 'has') && next && SOLUTION_WORDS.with.includes(next)) {
      if (!has('solutions')) facets.push({ type: 'solutions', value: true, label: 'Solutions included' });
      index += 2;
      continue;
    }
    if ((token === 'no' || token === 'without') && next && SOLUTION_WORDS.with.includes(next)) {
      if (!has('solutions')) facets.push({ type: 'solutions', value: false, label: 'No solutions' });
      index += 2;
      continue;
    }
    if (SOLUTION_WORDS.with.includes(token)) {
      if (!has('solutions')) facets.push({ type: 'solutions', value: true, label: 'Solutions included' });
      index += 1;
      continue;
    }
    if (SOLUTION_WORDS.without.includes(token)) {
      if (!has('solutions')) facets.push({ type: 'solutions', value: false, label: 'No solutions' });
      index += 1;
      continue;
    }

    const year = readYearToken(token);
    if (year) {
      if (!has('years')) {
        facets.push({
          type: 'years',
          value: year,
          label: year.from === year.to ? String(year.from) : `${year.from} – ${year.to}`,
        });
      }
      index += 1;
      continue;
    }

    const type = TYPE_WORDS.find((entry) => entry.words.includes(token));
    if (type) {
      if (!has('type')) facets.push({ type: 'type', value: type.code, label: PAPER_TYPES[type.code] });
      index += 1;
      continue;
    }

    if (!has('subject')) {
      const subject = lookup.get(token) || matchSubjectPrefix(token, lookup);
      if (subject) {
        takeSubject(subject, 1);
        continue;
      }
    }

    terms.push(token);
    index += 1;
  }

  return { facets, terms };
}

/** Does one paper satisfy a parsed facet? */
function matchesFacet(paper, facet) {
  switch (facet.type) {
    case 'subject':
      return paper.s === facet.value;
    case 'type':
      return paper.c === facet.value;
    case 'solutions':
      return facet.value ? paper.w === 1 : paper.w !== 1;
    case 'years': {
      const year = parseInt(String(paper.y), 10);
      if (!Number.isFinite(year)) return false;
      return year >= facet.value.from && year <= facet.value.to;
    }
    default:
      return true;
  }
}

/**
 * Applies parsed facets plus leftover free text to the paper list.
 * @param {Array<object>} papers
 * @param {{ facets: Array<object>, terms: string[] }} parsed
 * @param {{ subjects: string[], schools: string[] }} lookups
 */
export function applyLibraryQuery(papers, parsed, { subjects = [], schools = [] } = {}) {
  const { facets = [], terms = [] } = parsed || {};
  if (facets.length === 0 && terms.length === 0) return papers;

  return papers.filter((paper) => {
    if (!facets.every((facet) => matchesFacet(paper, facet))) return false;
    if (terms.length === 0) return true;

    const searchable = [
      paper.n,
      subjects[paper.s],
      schools[paper.h],
      paper.y,
      PAPER_TYPES[paper.c] || '',
      paper.w === 1 ? 'solutions answers' : '',
    ].join(' ').toLowerCase();

    return terms.every((term) => searchable.includes(term));
  });
}

/** Rebuilds the search text after a chip is dismissed. */
export function removeFacet(parsed, facetType) {
  return {
    facets: (parsed?.facets || []).filter((facet) => facet.type !== facetType),
    terms: parsed?.terms || [],
  };
}

const TYPE_TOKENS = { H: 'hsc', T: 'trial', A: 'assessment' };

/**
 * Turns one facet back into text the parser will read the same way. Labels are
 * for display only — "School trial" would not survive a round trip, "trial" does.
 */
function facetToToken(facet) {
  switch (facet.type) {
    case 'years':
      return facet.value.from === facet.value.to
        ? String(facet.value.from)
        : `${facet.value.from}-${facet.value.to}`;
    case 'solutions':
      return facet.value ? 'with solutions' : 'no solutions';
    case 'type':
      return TYPE_TOKENS[facet.value] || '';
    case 'subject':
      return String(facet.label).toLowerCase();
    default:
      return '';
  }
}

/** Turns facets and leftovers back into a query string for the input field. */
export function stringifyQuery(parsed) {
  const parts = (parsed?.facets || []).map(facetToToken).filter(Boolean);
  return [...parts, ...(parsed?.terms || [])].join(' ').trim();
}

/** Rebuilds the query with one facet replaced (or removed, when value is null). */
export function withFacet(parsed, type, facet) {
  const kept = (parsed?.facets || []).filter((entry) => entry.type !== type);
  const next = facet ? [facet, ...kept] : kept;
  return stringifyQuery({ facets: next, terms: parsed?.terms || [] });
}
