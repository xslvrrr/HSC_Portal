import fs from 'fs'
import { resolve } from 'path'

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const pid = url.searchParams.get('paperId') || url.searchParams.get('paper')
    const raw = fs.readFileSync(resolve(process.cwd(), 'public', 'papers.json'), 'utf-8')
    const data = JSON.parse(raw)
    const papers = data.papers || []
    const paper = papers.find(p => String(p.v) === String(pid))
    if (!paper) {
      res.statusCode = 404
      res.setHeader('Content-Type', 'application/json')
      res.end(JSON.stringify({ error: 'paper not found' }))
      return
    }

    // Fake question extraction: split title into up to 6 chunks as demo
    const text = String(paper.n || '')
    const parts = text.split(/[:;-]|\.\s+/).map(s => s.trim()).filter(Boolean)
    const questions = parts.slice(0, 6).map((t, i) => ({ id: i+1, qnum: i+1, text: `Question ${i+1}: ${t}`, page: 1 }))
    if (questions.length === 0) questions.push({ id: 1, qnum: 1, text: `Question 1: ${paper.n}`, page: 1 })

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ paperId: paper.v, questions }))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: String(e) }))
  }
}
