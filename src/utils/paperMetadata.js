export function createEmptyPaperMetadata(status = 'loading') {
  return {
    status,
    cached: false,
    questionCount: 0,
    totalMarks: null,
    questions: [],
    confidence: null,
    notes: '',
    retryAfterSeconds: null,
    error: '',
  };
}

function isKnownMark(value) {
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value));
}

function normaliseMetadata(data, { cached = true } = {}) {
  return {
    ...createEmptyPaperMetadata(data?.status || 'ready'),
    cached,
    paperKey: data?.paperKey || '',
    questionCount: Number(data?.questionCount) || 0,
    totalMarks: isKnownMark(data?.totalMarks) ? Number(data.totalMarks) : null,
    questions: Array.isArray(data?.questions) ? data.questions : [],
    confidence: data?.confidence || null,
    notes: data?.notes || '',
    sourceFingerprint: data?.sourceFingerprint || '',
    retryAfterSeconds: Number(data?.retryAfterSeconds) || null,
    // A recorded server-side failure is worth showing; a healthy record carries no error.
    error: data?.status === 'error' ? String(data?.error || 'The last analysis of this paper failed.') : '',
  };
}

function metadataRequestUrl(paper) {
  const params = new URLSearchParams({
    paperId: String(paper?.v || ''),
    paperName: String(paper?.n || ''),
  });
  return `/api/paper-metadata?${params.toString()}`;
}

async function readMetadataResponse(paper) {
  const response = await fetch(metadataRequestUrl(paper));
  const payload = await response.json().catch(() => ({}));

  if (response.status === 404) return createEmptyPaperMetadata('missing');
  if (!response.ok) {
    throw new Error(payload?.error || 'Paper structure could not be loaded.');
  }

  return normaliseMetadata(payload, { cached: true });
}

// Cache reads use the validated server endpoint rather than a direct Firestore read.
// This guarantees the browser reads the same named database, document identity, and
// source fingerprint as the privileged cache writer, while exposing only reusable paper structure.
export async function getPaperMetadata(paper) {
  return readMetadataResponse(paper);
}

export async function analysePaperMetadata(paper, idToken) {
  const response = await fetch(metadataRequestUrl(paper), {
    method: 'POST',
    headers: { Authorization: `Bearer ${idToken}` },
  });
  const payload = await response.json().catch(() => ({}));

  if (response.status === 202) {
    return { ...createEmptyPaperMetadata('analysing'), ...payload };
  }
  if (!response.ok) {
    throw new Error(payload?.error || 'The paper structure could not be analysed.');
  }
  return normaliseMetadata(payload, { cached: false });
}
