import fs from 'fs'
import { resolve } from 'path'
import { generateMockAnswer } from '../../openrouterHandler.js'
import { resolveOpenRouterKey } from '../../openRouterKeyResolver.js'

async function readJsonBody(req) {
  let body = ''
  for await (const chunk of req) body += chunk
  try { return body ? JSON.parse(body) : {} } catch (err) { return {} }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: 'Method not allowed' }))
    return
  }

  try {
    const parsed = await readJsonBody(req)
    const paperId = parsed.paperId
    const questionId = parsed.questionId
    const prompt = String(parsed.prompt || '').trim()

    const raw = fs.readFileSync(resolve(process.cwd(), 'public', 'papers.json'), 'utf-8')
    const data = JSON.parse(raw)
    const papers = data.papers || []
    const paper = papers.find(p => String(p.v) === String(paperId))
    const paperTitle = paper ? paper.n : 'Unknown paper'
    const questionText = parsed.questionText || (questionId ? `Question ${questionId} from ${paperTitle}` : '')

    const context = [`Paper title: ${paperTitle}`, `Question: ${questionText}`].join('\n')

    const keySelection = resolveOpenRouterKey(req, process.env.OPENROUTER_API_KEY)
    if (keySelection.error) {
      res.statusCode = 400
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: keySelection.error }))
      return
    }

    // If neither key source is available, keep the local prototype fallback.
    if (!keySelection.key) {
      const answer = generateMockAnswer(prompt || '', context)
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ answer }))
      return
    }

    // Proxy request to OpenRouter
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keySelection.key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hsc-portal',
        'X-Title': 'HSC Portal',
      },
      body: JSON.stringify({
        model: parsed.model || 'openrouter/free',
        messages: [
          { role: 'system', content: 'You are a calm HSC study coach for a student revision app.' },
          { role: 'user', content: [`Context from the app:`, context || 'No extra app context provided.', '', `Request: ${prompt}`].join('\n') },
        ],
        max_tokens: parsed.max_tokens || 700,
        temperature: parsed.temperature || 0.4,
      }),
    })

    const rawText = await response.text()
    let payload = null
    try { payload = JSON.parse(rawText) } catch (err) { /* ignore */ }

    if (!response.ok) {
      const message = payload?.error?.message || rawText || `OpenRouter request failed with status ${response.status}.`
      res.statusCode = response.status
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: message }))
      return
    }

    const answer = payload?.choices?.[0]?.message?.content?.trim()
    if (!answer) {
      res.statusCode = 502
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'No response came back from OpenRouter.' }))
      return
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ answer }))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: String(e) }))
  }
}
