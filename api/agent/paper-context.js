import fs from 'fs'
import { resolve } from 'path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { WorkerMessageHandler } from 'pdfjs-dist/legacy/build/pdf.worker.mjs'

// The serverless runtime does not retain pdf.js's dynamically imported worker file.
// Register a directly imported worker handler instead, which lets pdf.js use its
// Node-compatible in-process worker without resolving a separate runtime module.
if (!globalThis.pdfjsWorker) {
  globalThis.pdfjsWorker = { WorkerMessageHandler }
}

export const maxDuration = 60;

const PAPER_HOST = 'https://hscportal.pages.dev/'
// Some PDFs reference unembedded standard fonts. In Node/Vercel, pdf.js passes
// this base directly to fs.readFile, so it must be a filesystem directory path.
const STANDARD_FONT_DATA_URL = `${resolve(process.cwd(), 'node_modules', 'pdfjs-dist', 'standard_fonts')}/`
const CACHE_TTL_MS = 60 * 60 * 1000
const MAX_PDF_BYTES = 12 * 1024 * 1024
const MAX_CACHED_PDFS = 4
// Callers share a 60s function ceiling with whatever they do next, so the source
// fetch must leave room rather than consume the whole request on its own.
const PDF_FETCH_TIMEOUT_MS = 45 * 1000
const MIN_PDF_FETCH_TIMEOUT_MS = 5 * 1000
const contextCache = new Map()
const pdfByteCache = new Map()

export function loadPaperRecord(paperId, paperName) {
  const raw = fs.readFileSync(resolve(process.cwd(), 'public', 'papers.json'), 'utf-8')
  const papers = JSON.parse(raw).papers || []
  return papers.find((paper) => (
    String(paper.v) === String(paperId)
    && (!paperName || paper.n === paperName)
  )) || null
}

function paperUrl(filePath) {
  const safePath = String(filePath || '')
    .split('/')
    .map((part) => encodeURIComponent(part))
    .join('/')
  return new URL(safePath, PAPER_HOST).toString()
}

function paperCacheKey(paper) {
  return `${paper.v}::${paper.n}`
}

export function getPaperSourceFingerprint(paper) {
  return JSON.stringify({
    paperId: String(paper?.v || ''),
    paperName: String(paper?.n || ''),
    sourcePath: String(paper?.cf || ''),
  })
}

function normaliseText(items) {
  return items
    .map((item) => (typeof item?.str === 'string' ? item.str : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function pruneExpiredEntries(cache) {
  const now = Date.now()
  for (const [key, entry] of cache.entries()) {
    if (now - entry.createdAt >= CACHE_TTL_MS) cache.delete(key)
  }
}

function storePdfBytes(cacheKey, bytes) {
  pruneExpiredEntries(pdfByteCache)
  if (pdfByteCache.size >= MAX_CACHED_PDFS) {
    const oldestKey = pdfByteCache.keys().next().value
    if (oldestKey) pdfByteCache.delete(oldestKey)
  }
  pdfByteCache.set(cacheKey, { createdAt: Date.now(), bytes })
}

async function getPaperBytes(paper, { timeoutMs = PDF_FETCH_TIMEOUT_MS } = {}) {
  if (!paper?.cf) {
    return { unavailable: 'This paper does not have a direct PDF source in the library.' }
  }

  const cacheKey = paperCacheKey(paper)
  const cached = pdfByteCache.get(cacheKey)
  if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
    return { bytes: cached.bytes, cached: true }
  }

  const response = await fetch(paperUrl(paper.cf), {
    signal: AbortSignal.timeout(Math.max(Number(timeoutMs) || 0, MIN_PDF_FETCH_TIMEOUT_MS)),
    headers: { Accept: 'application/pdf' },
  })

  if (!response.ok) {
    throw new Error(`The paper PDF could not be retrieved (status ${response.status}).`)
  }

  const declaredLength = Number(response.headers.get('content-length') || 0)
  if (declaredLength > MAX_PDF_BYTES) {
    return { unavailable: 'The paper is too large to add to the AI context safely.' }
  }

  const bytes = new Uint8Array(await response.arrayBuffer())
  if (bytes.byteLength > MAX_PDF_BYTES) {
    return { unavailable: 'The paper is too large to add to the AI context safely.' }
  }

  storePdfBytes(cacheKey, bytes)
  return { bytes, cached: false }
}

export async function extractFullPaperText(paper, { timeoutMs } = {}) {
  const paperBytes = await getPaperBytes(paper, { timeoutMs })
  if (paperBytes.unavailable) {
    return {
      status: 'unavailable',
      reason: paperBytes.unavailable,
      pagesExtracted: 0,
      totalPages: 0,
      text: '',
    }
  }

  // pdf.js may transfer and detach the buffer it receives, so retain cached bytes
  // by giving the parser its own copy for each full-paper extraction.
  const loadingTask = getDocument({
    data: paperBytes.bytes.slice(),
    disableWorker: true,
    standardFontDataUrl: STANDARD_FONT_DATA_URL,
  })
  const pdf = await loadingTask.promise
  const pageText = []

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const text = normaliseText(content.items)
    if (text) pageText.push(`Page ${pageNumber}: ${text}`)
  }

  const text = pageText.join('\n')
  return {
    status: text ? 'ready' : 'unavailable',
    reason: text ? '' : 'This PDF does not expose selectable text for the AI to read.',
    pagesExtracted: pageText.length,
    totalPages: pdf.numPages,
    text,
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const paperId = requestUrl.searchParams.get('paperId')
    const paperName = requestUrl.searchParams.get('paperName')

    if (!paperId) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'paperId is required.' }))
      return
    }

    const cacheKey = `${paperId}::${paperName || ''}`
    const cached = contextCache.get(cacheKey)
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ ...cached.payload, cached: true }))
      return
    }

    const paper = loadPaperRecord(paperId, paperName)
    if (!paper) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'The requested paper was not found in the library.' }))
      return
    }

    const extracted = await extractFullPaperText(paper)
    const payload = {
      paperId: String(paper.v),
      paperName: paper.n,
      status: extracted.status,
      reason: extracted.reason || '',
      pagesExtracted: extracted.pagesExtracted || 0,
      pageStart: extracted.text ? 1 : 0,
      pageEnd: extracted.totalPages || 0,
      nextPage: null,
      totalPages: extracted.totalPages || 0,
      text: extracted.text || '',
      cached: false,
    }

    contextCache.set(cacheKey, { createdAt: Date.now(), payload })
    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(payload))
  } catch (error) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: error?.message || 'Failed to prepare paper context.' }))
  }
}
