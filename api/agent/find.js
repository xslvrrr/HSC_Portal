import fs from 'fs'
import { resolve } from 'path'

export default async function handler(req, res) {
  try {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`)
    const q = url.searchParams.get('q') || url.searchParams.get('query') || ''
    const raw = fs.readFileSync(resolve(process.cwd(), 'public', 'papers.json'), 'utf-8')
    const data = JSON.parse(raw)
    const papers = data.papers || []
    const subjects = data.subjects || []
    const ql = String(q || '').toLowerCase()
    const matches = papers.filter(p => {
      return String(p.n || '').toLowerCase().includes(ql) ||
             String(subjects[p.s] || '').toLowerCase().includes(ql)
    }).slice(0, 12).map(p => ({ v: p.v, n: p.n, s: subjects[p.s] || p.s, y: p.y }))

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ results: matches }))
  } catch (e) {
    res.statusCode = 500
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify({ error: String(e) }))
  }
}
