export const MY_SUBJECTS_STORAGE_KEY = 'hsc_my_subjects';
export const VIEWED_PAPERS_STORAGE_KEY = 'hsc_viewed_papers';
export const COMPLETED_PAPERS_STORAGE_KEY = 'hsc_completed_papers';

export const MAX_VIEWED_PAPERS = 200;
export const MAX_COMPLETED_PAPERS = 500;

export function readStoredArray(storageKey) {
  try {
    const parsed = JSON.parse(localStorage.getItem(storageKey) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    return [];
  }
}

export function writeStoredArray(storageKey, entries) {
  try {
    localStorage.setItem(storageKey, JSON.stringify(entries));
  } catch (error) {
    // Local storage is a convenience cache; account sync remains available when it is unavailable.
  }
}

export function mergeMySubjects(remoteSubjects, localSubjects) {
  return [...new Set([...(Array.isArray(remoteSubjects) ? remoteSubjects : []), ...(Array.isArray(localSubjects) ? localSubjects : [])]
    .filter((subject) => typeof subject === 'string' && subject.trim())
    .map((subject) => subject.trim()))];
}

function viewedIdentity(entry) {
  return String(entry?.key || entry?.paperId || entry?.v || '');
}

function completedIdentity(entry) {
  return String(entry?.paperId || entry?.paperIdLegacy || entry?.key || entry?.v || '');
}

function mergeHistory(remoteEntries, localEntries, { identity, timestampKey, limit }) {
  const entries = [...(Array.isArray(remoteEntries) ? remoteEntries : []), ...(Array.isArray(localEntries) ? localEntries : [])]
    .filter(Boolean);
  const latestByPaper = new Map();

  entries.forEach((entry) => {
    const key = identity(entry);
    if (!key) return;
    const current = latestByPaper.get(key);
    const entryTimestamp = Number(entry?.[timestampKey]) || 0;
    const currentTimestamp = Number(current?.[timestampKey]) || 0;
    if (!current || entryTimestamp >= currentTimestamp) latestByPaper.set(key, entry);
  });

  return [...latestByPaper.values()]
    .sort((a, b) => (Number(b?.[timestampKey]) || 0) - (Number(a?.[timestampKey]) || 0))
    .slice(0, limit);
}

export function mergeViewedPapers(remoteEntries, localEntries) {
  return mergeHistory(remoteEntries, localEntries, {
    identity: viewedIdentity,
    timestampKey: 'dateViewed',
    limit: MAX_VIEWED_PAPERS,
  });
}

export function mergeCompletedPapers(remoteEntries, localEntries) {
  return mergeHistory(remoteEntries, localEntries, {
    identity: completedIdentity,
    timestampKey: 'dateCompleted',
    limit: MAX_COMPLETED_PAPERS,
  });
}

export function sameSerializedValue(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function notifyStudySyncUpdate() {
  try {
    window.dispatchEvent(new CustomEvent('hsc:my-subjects-updated'));
    window.dispatchEvent(new CustomEvent('hsc:history-updated'));
  } catch (error) {
    // Ignore environments that do not expose browser events.
  }
}
