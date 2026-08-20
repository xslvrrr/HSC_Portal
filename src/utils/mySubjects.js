export const MY_SUBJECTS_STORAGE_KEY = 'hsc_my_subjects';

/** @returns {string[]} */
export function loadMySubjects() {
  try {
    const raw = localStorage.getItem(MY_SUBJECTS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((s) => typeof s === 'string');
  } catch (e) {
    return [];
  }
}

/** @param {string[]} names @returns {string[]} */
export function saveMySubjects(names) {
  const unique = [...new Set(names)];
  try {
    localStorage.setItem(MY_SUBJECTS_STORAGE_KEY, JSON.stringify(unique));
  } catch (e) {
    // ignore
  }
  try {
    window.dispatchEvent(new CustomEvent('hsc:my-subjects-updated', { detail: unique }));
  } catch (e) {
    // ignore
  }
  return unique;
}
