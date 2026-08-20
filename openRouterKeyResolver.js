const PERSONAL_OPENROUTER_KEY_HEADER = 'x-openrouter-key';

function readHeader(req, name) {
  const headers = req?.headers || {};
  const value = headers[name] ?? headers[name.toLowerCase()];
  return Array.isArray(value) ? value[0] : value;
}

function isUsablePersonalKey(value) {
  if (typeof value !== 'string') return false;
  const key = value.trim();
  return key.length >= 16 && key.length <= 512 && !/\s/.test(key);
}

/**
 * Resolves an OpenRouter key without persisting or logging the user's personal key.
 * The personal-key header is used for this request only; otherwise the server secret
 * supplied by Vercel remains the default.
 */
export function resolveOpenRouterKey(req, serverKey) {
  const supplied = readHeader(req, PERSONAL_OPENROUTER_KEY_HEADER);
  const personalKey = typeof supplied === 'string' ? supplied.trim() : '';

  if (personalKey) {
    if (!isUsablePersonalKey(personalKey)) {
      return { key: '', source: 'personal', error: 'The personal OpenRouter key format is not valid.' };
    }
    return { key: personalKey, source: 'personal', error: '' };
  }

  return { key: String(serverKey || '').trim(), source: 'server', error: '' };
}

export { PERSONAL_OPENROUTER_KEY_HEADER };
