const PAPER_ID_FIELDS = ['v', 's', 'l', 'c', 'y', 'h', 'w', 'n'];

export function getPaperIdentity(paper) {
  if (!paper) return '';
  return JSON.stringify(PAPER_ID_FIELDS.map((field) => paper[field]));
}

export function getPaperRouteId(paper) {
  return encodeURIComponent(getPaperIdentity(paper));
}

export function getPaperStorageKey(paper, prefix) {
  return `${prefix}_${getPaperIdentity(paper)}`;
}

export function getLegacyPaperStorageKey(paper, prefix) {
  return `${prefix}_${String(paper?.v ?? '')}`;
}

function parsePaperIdentity(identifier) {
  if (!identifier) return null;

  let decoded = identifier;
  try {
    decoded = decodeURIComponent(identifier);
  } catch (e) {
    // keep the raw identifier
  }

  try {
    const parsed = JSON.parse(decoded);
    if (Array.isArray(parsed) && parsed.length === PAPER_ID_FIELDS.length) {
      return { type: 'composite', value: parsed.map((part) => String(part)) };
    }
  } catch (e) {
    // fall through to legacy lookup
  }

  return { type: 'legacy', value: String(decoded) };
}

export function findPaperByIdentifier(papers = [], identifier) {
  const parsed = parsePaperIdentity(identifier);
  if (!parsed) return null;

  if (parsed.type === 'composite') {
    return (
      papers.find((paper) =>
        PAPER_ID_FIELDS.every((field, index) => String(paper?.[field] ?? '') === parsed.value[index])
      ) || null
    );
  }

  return papers.find((paper) => String(paper?.v ?? '') === parsed.value) || null;
}
