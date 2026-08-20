import { getPaperIdentity } from './paperIdentity';

const VIEWED_KEY = 'hsc_viewed_papers';
const COMPLETED_KEY = 'hsc_completed_papers';
const ONE_DAY = 24 * 60 * 60 * 1000;

function readHistory(key) {
  try {
    const value = JSON.parse(localStorage.getItem(key) || '[]');
    return Array.isArray(value) ? value : [];
  } catch {
    return [];
  }
}

export function loadRecommendationHistory() {
  return {
    viewed: readHistory(VIEWED_KEY),
    completed: readHistory(COMPLETED_KEY),
  };
}

function countBy(items, getKey) {
  return items.reduce((counts, item) => {
    const key = getKey(item);
    if (key === undefined || key === null || key === '') return counts;
    counts.set(String(key), (counts.get(String(key)) || 0) + 1);
    return counts;
  }, new Map());
}

function latestBy(items, getKey, getDate) {
  return items.reduce((dates, item) => {
    const key = getKey(item);
    const date = Number(getDate(item)) || 0;
    if (key === undefined || key === null || key === '') return dates;
    dates.set(String(key), Math.max(dates.get(String(key)) || 0, date));
    return dates;
  }, new Map());
}

function categoryLabel(code) {
  if (code === 'H') return 'official paper';
  if (code === 'T') return 'trial paper';
  if (code === 'A') return 'assessment task';
  return 'resource';
}

function paperMatchesHistory(paper, entry) {
  const paperId = getPaperIdentity(paper);
  const storedId = String(entry?.paperId || entry?.key || '');
  if (storedId && storedId === paperId) return true;
  if (String(entry?.paperIdLegacy || '') === String(paper.v) && entry?.paperName === paper.n) return true;
  if (String(entry?.v || '') === String(paper.v) && entry?.n === paper.n && String(entry?.y || '') === String(paper.y || '')) return true;
  return false;
}

function recentWeight(timestamp, now) {
  const age = Math.max(0, now - (Number(timestamp) || 0));
  if (age <= 7 * ONE_DAY) return 3;
  if (age <= 30 * ONE_DAY) return 2;
  if (age <= 90 * ONE_DAY) return 1;
  return 0.5;
}

function getReason({ paper, subjectName, selectedSubjectName, bookmarked, subjectActivity, lastCategory, subjectHasNoCompletion }) {
  if (selectedSubjectName && subjectName === selectedSubjectName) {
    return `Matches your selected ${subjectName} focus`;
  }
  if (bookmarked) return 'You saved this for later';
  if ((subjectActivity.get(String(paper.s)) || 0) > 0) {
    if (lastCategory.get(String(paper.s)) && lastCategory.get(String(paper.s)) !== paper.c) {
      return `Adds a ${categoryLabel(paper.c)} after your recent ${categoryLabel(lastCategory.get(String(paper.s)))}`;
    }
    return `Keeps your ${subjectName} practice moving`;
  }
  if (subjectHasNoCompletion && paper.w === 1) return 'Includes solutions for a guided first attempt';
  if (paper.w === 1) return 'Includes solutions for review';
  return `A fresh ${subjectName} practice option`;
}

export function getAdaptiveRecommendations({
  papers = [],
  subjects = [],
  selectedLevel = 12,
  selectedSubject = null,
  mySubjects = [],
  bookmarks = new Set(),
  viewed = [],
  completed = [],
  paperType = 'all',
  requireSubjectScope = true,
  limit = 3,
  now = Date.now(),
}) {
  const selectedSubjectName = selectedSubject !== null ? subjects[selectedSubject] : null;
  const preferredSubjectNames = new Set(
    (selectedSubjectName ? [selectedSubjectName] : mySubjects)
      .filter(Boolean)
      .map((name) => String(name)),
  );
  const preferredSubjectIds = new Set(
    subjects
      .map((name, index) => preferredSubjectNames.has(String(name)) ? index : -1)
      .filter((index) => index >= 0),
  );

  if (requireSubjectScope && preferredSubjectIds.size === 0) return [];

  const completedRecords = completed.filter(Boolean);
  const viewedRecords = viewed.filter(Boolean);
  const completedBySubject = countBy(completedRecords, (entry) => entry.subjectName || entry.s);
  const viewedBySubject = countBy(viewedRecords, (entry) => entry.s);
  const recentViewedBySubject = viewedRecords.reduce((counts, entry) => {
    const subjectId = String(entry?.s ?? '');
    if (!subjectId) return counts;
    counts.set(subjectId, (counts.get(subjectId) || 0) + recentWeight(entry.dateViewed, now));
    return counts;
  }, new Map());
  const latestViewedBySubject = latestBy(viewedRecords, (entry) => entry.s, (entry) => entry.dateViewed);
  const resolveHistoryCategory = (entry) => {
    if (entry?.c) return entry.c;
    const paper = papers.find((candidate) => paperMatchesHistory(candidate, entry));
    return paper?.c || '';
  };
  const lastViewedCategory = new Map();
  viewedRecords
    .slice()
    .sort((a, b) => (Number(b?.dateViewed) || 0) - (Number(a?.dateViewed) || 0))
    .forEach((entry) => {
      const subjectId = String(entry?.s ?? '');
      const category = resolveHistoryCategory(entry);
      if (subjectId && category && !lastViewedCategory.has(subjectId)) lastViewedCategory.set(subjectId, category);
    });

  const subjectActivity = new Map();
  subjects.forEach((subjectName, subjectId) => {
    const id = String(subjectId);
    const activity = (completedBySubject.get(subjectName) || completedBySubject.get(id) || 0) * 3
      + (recentViewedBySubject.get(id) || 0)
      + (viewedBySubject.get(id) || 0) * 0.25;
    subjectActivity.set(id, activity);
  });

  const eligible = papers.filter((paper) => {
    if (paper.l !== selectedLevel) return false;
    if (preferredSubjectIds.size === 0 || !preferredSubjectIds.has(paper.s)) return false;
    if (paperType !== 'all' && paper.c !== paperType) return false;
    return !completedRecords.some((entry) => paperMatchesHistory(paper, entry));
  });

  const scored = eligible.map((paper) => {
    const subjectName = subjects[paper.s] || 'this subject';
    const subjectId = String(paper.s);
    const bookmarked = bookmarks.has(`${paper.v}_${paper.n}`);
    const recentlyViewed = latestViewedBySubject.get(subjectId) || 0;
    const viewAge = recentlyViewed ? Math.max(0, now - recentlyViewed) : Infinity;
    const lastCategory = lastViewedCategory.get(subjectId);
    const completedCount = completedBySubject.get(subjectName) || completedBySubject.get(subjectId) || 0;

    let score = 0;
    if (selectedSubjectName && subjectName === selectedSubjectName) score += 90;
    else if (preferredSubjectIds.has(paper.s)) score += 48;
    else if (preferredSubjectIds.size === 0) score += 20;

    score += Math.min(subjectActivity.get(subjectId) || 0, 18) * 2;
    if (bookmarked) score += 24;
    if (paper.w === 1) score += completedCount === 0 ? 15 : 6;
    if (lastCategory && lastCategory !== paper.c) score += 9;
    if (viewAge > 3 * ONE_DAY) score += 8;
    if (viewAge > 21 * ONE_DAY) score += 6;
    if (viewedRecords.some((entry) => paperMatchesHistory(paper, entry))) score -= 16;

    const paperYear = Number(paper.y) || 0;
    const currentYear = new Date(now).getFullYear();
    score += Math.max(0, 7 - Math.min(7, Math.abs(currentYear - paperYear))) * 0.7;

    return {
      paper,
      score,
      reason: getReason({
        paper,
        subjectName,
        selectedSubjectName,
        bookmarked,
        subjectActivity,
        lastCategory: lastViewedCategory,
        subjectHasNoCompletion: completedCount === 0,
      }),
    };
  });

  scored.sort((a, b) => b.score - a.score || Number(b.paper.y || 0) - Number(a.paper.y || 0));

  const selected = [];
  const subjectPicks = new Map();
  for (const item of scored) {
    const picks = subjectPicks.get(item.paper.s) || 0;
    const shouldDiversify = selected.length < limit - 1 && preferredSubjectIds.size !== 1;
    if (shouldDiversify && picks >= 1) continue;
    selected.push(item);
    subjectPicks.set(item.paper.s, picks + 1);
    if (selected.length === limit) break;
  }

  if (selected.length < limit) {
    for (const item of scored) {
      if (selected.includes(item)) continue;
      selected.push(item);
      if (selected.length === limit) break;
    }
  }

  return selected;
}
