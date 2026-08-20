const PROVIDER_MODE_STORAGE_KEY = 'hsc_openrouter_provider_mode';
const PERSONAL_KEY_STORAGE_KEY = 'hsc_openrouter_personal_key';

export const OPENROUTER_PROVIDER_MODES = {
  PORTAL: 'portal',
  PERSONAL: 'personal',
};

function readSessionValue(key) {
  try {
    return sessionStorage.getItem(key) || '';
  } catch {
    return '';
  }
}

export function loadOpenRouterSettings() {
  const providerMode = readSessionValue(PROVIDER_MODE_STORAGE_KEY);
  return {
    providerMode: providerMode === OPENROUTER_PROVIDER_MODES.PERSONAL
      ? OPENROUTER_PROVIDER_MODES.PERSONAL
      : OPENROUTER_PROVIDER_MODES.PORTAL,
    personalKey: readSessionValue(PERSONAL_KEY_STORAGE_KEY),
  };
}

export function saveOpenRouterSettings(settings) {
  try {
    const providerMode = settings?.providerMode === OPENROUTER_PROVIDER_MODES.PERSONAL
      ? OPENROUTER_PROVIDER_MODES.PERSONAL
      : OPENROUTER_PROVIDER_MODES.PORTAL;
    const personalKey = String(settings?.personalKey || '').trim();

    sessionStorage.setItem(PROVIDER_MODE_STORAGE_KEY, providerMode);
    if (personalKey) sessionStorage.setItem(PERSONAL_KEY_STORAGE_KEY, personalKey);
    else sessionStorage.removeItem(PERSONAL_KEY_STORAGE_KEY);
  } catch {
    // Session storage may be unavailable in restrictive browser contexts.
  }
}

export function getOpenRouterRequestHeaders(settings) {
  const personalKey = String(settings?.personalKey || '').trim();
  if (settings?.providerMode !== OPENROUTER_PROVIDER_MODES.PERSONAL || !personalKey) {
    return {};
  }

  return { 'X-OpenRouter-Key': personalKey };
}
