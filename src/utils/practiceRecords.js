import { getPaperIdentity } from './paperIdentity';
import { readStoredArray, writeStoredArray } from './studySync';

export const PRACTICE_REVIEWS_STORAGE_KEY = 'hsc_practice_reviews';
export const MISTAKE_LOG_STORAGE_KEY = 'hsc_mistake_log';
export const MAX_PRACTICE_REVIEWS = 250;
export const MAX_MISTAKE_LOG_ENTRIES = 500;

function isKnownNumber(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function createRecordId(prefix) {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return `${prefix}_${crypto.randomUUID()}`;
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
}

function sortNewest(entries, timestampKey) {
  return [...entries].sort((left, right) => (
    (Number(right?.[timestampKey]) || 0) - (Number(left?.[timestampKey]) || 0)
  ));
}

function mergeById(remoteEntries, localEntries, { timestampKey, limit }) {
  const newestById = new Map();
  [...(Array.isArray(remoteEntries) ? remoteEntries : []), ...(Array.isArray(localEntries) ? localEntries : [])]
    .filter((entry) => entry && typeof entry === 'object' && entry.id)
    .forEach((entry) => {
      const id = String(entry.id);
      const existing = newestById.get(id);
      if (!existing || (Number(entry?.[timestampKey]) || 0) >= (Number(existing?.[timestampKey]) || 0)) {
        newestById.set(id, entry);
      }
    });

  return sortNewest([...newestById.values()], timestampKey).slice(0, limit);
}

export function mergePracticeReviews(remoteEntries, localEntries) {
  return mergeById(remoteEntries, localEntries, {
    timestampKey: 'updatedAt',
    limit: MAX_PRACTICE_REVIEWS,
  });
}

export function mergeMistakeLog(remoteEntries, localEntries) {
  return mergeById(remoteEntries, localEntries, {
    timestampKey: 'updatedAt',
    limit: MAX_MISTAKE_LOG_ENTRIES,
  });
}

export function loadPracticeReviews() {
  return readStoredArray(PRACTICE_REVIEWS_STORAGE_KEY);
}

export function loadMistakeLog() {
  return readStoredArray(MISTAKE_LOG_STORAGE_KEY);
}

export function notifyPracticeRecordsUpdated() {
  try {
    window.dispatchEvent(new CustomEvent('hsc:study-records-updated'));
  } catch (error) {
    // Ignore non-browser environments.
  }
}

export function savePracticeReview({ paper, subjectName, schoolName, review }) {
  const timestamp = Date.now();
  const entry = {
    id: review?.id || createRecordId('review'),
    paperId: getPaperIdentity(paper),
    paperIdLegacy: paper?.v,
    paperName: paper?.n || '',
    subjectName: subjectName || '',
    schoolName: schoolName || '',
    score: isKnownNumber(review?.score) ? Number(review.score) : null,
    totalMarks: isKnownNumber(review?.totalMarks) ? Number(review.totalMarks) : null,
    timeSpent: Number.isFinite(Number(review?.timeSpent)) ? Number(review.timeSpent) : 0,
    confidence: Number.isFinite(Number(review?.confidence)) ? Number(review.confidence) : null,
    reflection: String(review?.reflection || '').trim().slice(0, 1500),
    questionCount: Number.isFinite(Number(review?.questionCount)) ? Number(review.questionCount) : 0,
    metadataStatus: String(review?.metadataStatus || 'missing'),
    createdAt: Number(review?.createdAt) || timestamp,
    updatedAt: timestamp,
  };

  const current = loadPracticeReviews();
  const next = mergePracticeReviews([], [entry, ...current]);
  writeStoredArray(PRACTICE_REVIEWS_STORAGE_KEY, next);
  notifyPracticeRecordsUpdated();
  return entry;
}

export function saveMistake({ paper, subjectName, schoolName, mistake }) {
  const timestamp = Date.now();
  const entry = {
    id: mistake?.id || createRecordId('mistake'),
    paperId: getPaperIdentity(paper),
    paperIdLegacy: paper?.v,
    paperName: paper?.n || '',
    subjectName: subjectName || '',
    schoolName: schoolName || '',
    questionId: String(mistake?.questionId || '').trim().slice(0, 40),
    questionMarks: isKnownNumber(mistake?.questionMarks) ? Number(mistake.questionMarks) : null,
    topic: String(mistake?.topic || '').trim().slice(0, 120),
    category: String(mistake?.category || 'Other').trim().slice(0, 80),
    note: String(mistake?.note || '').trim().slice(0, 1500),
    createdAt: Number(mistake?.createdAt) || timestamp,
    updatedAt: timestamp,
  };

  const current = loadMistakeLog();
  const next = mergeMistakeLog([], [entry, ...current]);
  writeStoredArray(MISTAKE_LOG_STORAGE_KEY, next);
  notifyPracticeRecordsUpdated();
  return entry;
}

export function removeMistake(mistakeId) {
  const next = loadMistakeLog().filter((entry) => String(entry?.id) !== String(mistakeId));
  writeStoredArray(MISTAKE_LOG_STORAGE_KEY, next);
  notifyPracticeRecordsUpdated();
  return next;
}
