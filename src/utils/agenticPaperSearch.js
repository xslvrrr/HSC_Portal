const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'at',
  'be',
  'by',
  'exam',
  'exams',
  'find',
  'for',
  'from',
  'give',
  'hsc',
  'i',
  'in',
  'me',
  'of',
  'on',
  'paper',
  'papers',
  'past',
  'please',
  'practice',
  'show',
  'some',
  'after',
  'before',
  'between',
  'newer',
  'older',
  'since',
  'until',
  'that',
  'the',
  'to',
  'with',
  'year',
  'years',
]);

const SUBJECT_ALIASES = {
  'advanced maths': 'Maths (2U)',
  'math advanced': 'Maths (2U)',
  'maths advanced': 'Maths (2U)',
  'mathematics advanced': 'Maths (2U)',
  'math extension 1': 'Maths Ext 1',
  'maths extension 1': 'Maths Ext 1',
  'mathematics extension 1': 'Maths Ext 1',
  'extension 1 maths': 'Maths Ext 1',
  'ext 1 maths': 'Maths Ext 1',
  'math extension 2': 'Maths Ext 2',
  'maths extension 2': 'Maths Ext 2',
  'mathematics extension 2': 'Maths Ext 2',
  'extension 2 maths': 'Maths Ext 2',
  'ext 2 maths': 'Maths Ext 2',
  'standard maths': 'Standard Maths',
  'maths standard': 'Standard Maths',
  'general maths': 'General Maths',
  'sor 1': 'Studies of Religion 1',
  'religion 1': 'Studies of Religion 1',
  'sor 2': 'Studies of Religion 2',
  'religion 2': 'Studies of Religion 2',
  'software': 'Software Engineering',
  'software design': 'Software Engineering',
  'information processes': 'IPT',
  'ip&t': 'IPT',
  'pe': 'PDHPE',
  'pdh': 'PDHPE',
};

const CATEGORY_DETAILS = {
  H: 'Official HSC',
  T: 'trial exams',
  A: 'assessment tasks',
};

const normalize = (value) =>
  String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');

const unique = (items) => Array.from(new Set(items));

const includesPhrase = (text, phrase) => {
  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|\\s)${escaped}(\\s|$)`).test(text);
};

const parseYearIntent = (query) => {
  const years = [];
  const yearMatches = query.match(/\b(?:19|20)\d{2}\b/g) || [];
  yearMatches.forEach((year) => years.push(Number(year)));

  const afterMatch = query.match(/\b(?:after|since|newer than|from)\s+((?:19|20)\d{2})\b/);
  const beforeMatch = query.match(/\b(?:before|older than|until|pre)\s+((?:19|20)\d{2})\b/);
  const betweenMatch = query.match(/\b(?:between|from)\s+((?:19|20)\d{2})\s+(?:and|to|-)\s+((?:19|20)\d{2})\b/);

  if (betweenMatch) {
    return {
      years: [],
      minYear: Math.min(Number(betweenMatch[1]), Number(betweenMatch[2])),
      maxYear: Math.max(Number(betweenMatch[1]), Number(betweenMatch[2])),
    };
  }

  if (afterMatch || beforeMatch) {
    return {
      years: [],
      minYear: afterMatch ? Number(afterMatch[1]) : null,
      maxYear: beforeMatch ? Number(beforeMatch[1]) : null,
    };
  }

  return {
    years: unique(years),
    minYear: null,
    maxYear: null,
  };
};

const parseSubjectIntent = (normalizedQuery, subjects) => {
  const normalizedSubjects = subjects.map((subject, index) => ({
    index,
    name: subject,
    normalized: normalize(subject),
  }));

  const aliasMatch = Object.entries(SUBJECT_ALIASES).find(([alias, subject]) => {
    const target = normalizedSubjects.find((item) => item.name === subject);
    return target && includesPhrase(normalizedQuery, alias);
  });

  if (aliasMatch) {
    return normalizedSubjects.find((item) => item.name === aliasMatch[1]) || null;
  }

  return normalizedSubjects
    .filter((subject) => includesPhrase(normalizedQuery, subject.normalized))
    .sort((a, b) => b.normalized.length - a.normalized.length)[0] || null;
};

const parseSchoolIntent = (normalizedQuery, schools) => {
  const matches = schools
    .map((school, index) => ({ index, name: school, normalized: normalize(school) }))
    .filter((school) => {
      if (!school.normalized || school.normalized.length < 4) return false;
      return normalizedQuery.includes(school.normalized);
    })
    .sort((a, b) => b.normalized.length - a.normalized.length);

  return matches[0] || null;
};

export function analyzePaperQuery(query, subjects = [], schools = []) {
  const rawQuery = String(query || '').trim();
  const normalizedQuery = normalize(rawQuery);
  const tokens = unique(
    normalizedQuery
      .split(' ')
      .filter((token) => token.length > 2 && !/^\d+$/.test(token) && !STOP_WORDS.has(token))
  );

  const subject = parseSubjectIntent(normalizedQuery, subjects);
  const school = parseSchoolIntent(normalizedQuery, schools);
  const yearIntent = parseYearIntent(normalizedQuery);

  const wantsSolutions = /\b(solution|solutions|solved|answers|marking|guideline|guidelines|worked)\b/.test(normalizedQuery);
  const wantsTrials = /\b(trial|trials|school trial)\b/.test(normalizedQuery);
  const wantsOfficial = /\b(official|nesea|nesa|board of studies)\b/.test(normalizedQuery);
  const wantsAssessments = /\b(assessment|assessments|task|tasks|internal)\b/.test(normalizedQuery);
  const wantsRecent = /\b(recent|new|newer|newest|latest|modern)\b/.test(normalizedQuery);
  const wantsOlder = /\b(old|older|oldest|early|earliest)\b/.test(normalizedQuery);
  const levelMatch = normalizedQuery.match(/\byear\s*(11|12)\b|\b(prelim|preliminary)\b/);
  const level = levelMatch
    ? levelMatch[1]
      ? Number(levelMatch[1])
      : 11
    : null;

  let category = null;
  if (wantsTrials) category = 'T';
  if (wantsOfficial) category = 'H';
  if (wantsAssessments) category = 'A';

  return {
    rawQuery,
    normalizedQuery,
    tokens,
    subject,
    school,
    years: yearIntent.years,
    minYear: yearIntent.minYear,
    maxYear: yearIntent.maxYear,
    wantsSolutions,
    wantsRecent,
    wantsOlder,
    category,
    level,
  };
}

const getYearNumber = (paper) => {
  const year = Number.parseInt(String(paper.y), 10);
  return Number.isFinite(year) ? year : null;
};

const scorePaper = (paper, intent, subjects, schools) => {
  let score = 0;
  const reasons = [];
  const searchable = normalize([
    paper.n,
    subjects[paper.s],
    schools[paper.h],
    paper.y,
    CATEGORY_DETAILS[paper.c],
  ].join(' '));
  const year = getYearNumber(paper);

  if (intent.subject) {
    if (paper.s !== intent.subject.index) return null;
    score += 45;
    reasons.push(intent.subject.name);
  }

  if (intent.level) {
    if (paper.l !== intent.level) return null;
    score += 18;
    reasons.push(`Year ${intent.level}`);
  }

  if (intent.category) {
    if (paper.c !== intent.category) return null;
    score += 24;
    reasons.push(CATEGORY_DETAILS[intent.category]);
  }

  if (intent.school) {
    if (paper.h !== intent.school.index) return null;
    score += 26;
    reasons.push(intent.school.name);
  }

  if (intent.wantsSolutions) {
    if (paper.w !== 1) return null;
    score += 22;
    reasons.push('has solutions');
  }

  if (intent.years.length > 0) {
    if (!year || !intent.years.includes(year)) return null;
    score += 20;
    reasons.push(String(year));
  }

  if (intent.minYear && (!year || year < intent.minYear)) return null;
  if (intent.maxYear && (!year || year > intent.maxYear)) return null;

  if (intent.minYear || intent.maxYear) {
    score += 14;
    const rangeText = [
      intent.minYear ? `from ${intent.minYear}` : null,
      intent.maxYear ? `until ${intent.maxYear}` : null,
    ].filter(Boolean).join(' ');
    reasons.push(rangeText);
  }

  intent.tokens.forEach((token) => {
    if (searchable.includes(token)) score += 4;
  });

  if (intent.wantsRecent && year) score += Math.max(0, year - 2000) / 2;
  if (intent.wantsOlder && year) score += Math.max(0, 2030 - year) / 2;

  if (score <= 0 && intent.tokens.length > 0) return null;

  return { score, reasons: unique(reasons).slice(0, 4) };
};

export function findAgenticPaperMatches(query, papers = [], subjects = [], schools = [], { limit = 120, defaultLevel = null } = {}) {
  const intent = analyzePaperQuery(query, subjects, schools);

  // If the user's query didn't specify a year level, scope to the active sidebar level
  if (intent.level === null && defaultLevel !== null) {
    intent.level = defaultLevel;
  }

  if (!intent.rawQuery) {
    return {
      intent,
      papers: [],
      total: 0,
      applied: false,
      summary: '',
    };
  }

  const scored = papers
    .map((paper) => {
      const result = scorePaper(paper, intent, subjects, schools);
      return result ? { paper, score: result.score, reasons: result.reasons } : null;
    })
    .filter(Boolean)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ay = getYearNumber(a.paper) || 0;
      const by = getYearNumber(b.paper) || 0;
      return intent.wantsOlder ? ay - by : by - ay;
    });

  const summaryParts = [
    intent.subject?.name,
    intent.level ? `Year ${intent.level}` : null,
    intent.category ? CATEGORY_DETAILS[intent.category] : null,
    intent.school?.name,
    intent.wantsSolutions ? 'with solutions' : null,
    intent.minYear ? `from ${intent.minYear}` : null,
    intent.maxYear ? `until ${intent.maxYear}` : null,
    intent.years.length ? intent.years.join(', ') : null,
    intent.wantsRecent ? 'newest first' : null,
    intent.wantsOlder ? 'oldest first' : null,
  ].filter(Boolean);

  return {
    intent,
    papers: scored.slice(0, limit),
    total: scored.length,
    applied: true,
    summary: summaryParts.length ? summaryParts.join(' / ') : 'keyword-ranked papers',
  };
}

export async function findAgenticPaperMatchesAsync(query, papers = [], subjects = [], schools = [], { limit = 120, defaultLevel = null } = {}) {
  const localIntent = analyzePaperQuery(query, subjects, schools);

  if (localIntent.level === null && defaultLevel !== null) {
    localIntent.level = defaultLevel;
  }

  if (!localIntent.rawQuery) {
    return {
      intent: localIntent,
      papers: [],
      total: 0,
      applied: false,
      summary: '',
      isAiAssisted: false,
    };
  }

  // If local parser found a subject match, consider it high confidence and skip LLM to save latency/tokens.
  if (localIntent.subject !== null) {
    const localResult = findAgenticPaperMatches(query, papers, subjects, schools, { limit, defaultLevel });
    return {
      ...localResult,
      isAiAssisted: false,
    };
  }

  // No subject matched locally. Fallback to OpenRouter LLM parsing.
  try {
    const res = await fetch('/api/agent-search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query,
        subjects,
        schools,
      }),
    });

    if (!res.ok) {
      throw new Error(`API returned status ${res.status}`);
    }

    const data = await res.json();
    if (!data.intent) {
      throw new Error('API response missing intent object');
    }

    const llmIntent = data.intent;

    // Map string subject/school back to structured objects with indices
    let subject = null;
    if (llmIntent.subject) {
      const normSubject = normalize(llmIntent.subject);
      const idx = subjects.findIndex((s) => normalize(s) === normSubject);
      if (idx !== -1) {
        subject = {
          index: idx,
          name: subjects[idx],
          normalized: normSubject,
        };
      }
    }

    let school = null;
    if (llmIntent.school) {
      const normSchool = normalize(llmIntent.school);
      const idx = schools.findIndex((s) => normalize(s) === normSchool);
      if (idx !== -1) {
        school = {
          index: idx,
          name: schools[idx],
          normalized: normSchool,
        };
      }
    }

    const intent = {
      rawQuery: query,
      normalizedQuery: normalize(query),
      tokens: localIntent.tokens,
      subject,
      school,
      years: Array.isArray(llmIntent.years) ? llmIntent.years.map(Number) : [],
      minYear: llmIntent.minYear ? Number(llmIntent.minYear) : null,
      maxYear: llmIntent.maxYear ? Number(llmIntent.maxYear) : null,
      wantsSolutions: Boolean(llmIntent.wantsSolutions),
      wantsRecent: Boolean(llmIntent.wantsRecent),
      wantsOlder: Boolean(llmIntent.wantsOlder),
      category: llmIntent.category || null,
      level: llmIntent.level ? Number(llmIntent.level) : (defaultLevel || null),
    };

    const scored = papers
      .map((paper) => {
        const result = scorePaper(paper, intent, subjects, schools);
        return result ? { paper, score: result.score, reasons: result.reasons } : null;
      })
      .filter(Boolean)
      .sort((a, b) => {
        if (b.score !== a.score) return b.score - a.score;
        const ay = getYearNumber(a.paper) || 0;
        const by = getYearNumber(b.paper) || 0;
        return intent.wantsOlder ? ay - by : by - ay;
      });

    const summaryParts = [
      intent.subject?.name,
      intent.level ? `Year ${intent.level}` : null,
      intent.category ? CATEGORY_DETAILS[intent.category] : null,
      intent.school?.name,
      intent.wantsSolutions ? 'with solutions' : null,
      intent.minYear ? `from ${intent.minYear}` : null,
      intent.maxYear ? `until ${intent.maxYear}` : null,
      intent.years.length ? intent.years.join(', ') : null,
      intent.wantsRecent ? 'newest first' : null,
      intent.wantsOlder ? 'oldest first' : null,
    ].filter(Boolean);

    return {
      intent,
      papers: scored.slice(0, limit),
      total: scored.length,
      applied: true,
      summary: summaryParts.length ? summaryParts.join(' / ') : 'AI-ranked papers',
      isAiAssisted: true,
    };
  } catch (error) {
    console.warn('Agentic search LLM fallback failed, using local parser:', error);
    const localResult = findAgenticPaperMatches(query, papers, subjects, schools, { limit, defaultLevel });
    return {
      ...localResult,
      isAiAssisted: false,
      error: error.message,
    };
  }
}
