import http from 'http'
import url from 'url'
import { fileURLToPath } from 'url'
import path from 'path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const openrouter = (await import('../api/openrouter.js')).default
const find = (await import('../api/agent/find.js')).default
const extract = (await import('../api/agent/extract.js')).default
const ask = (await import('../api/agent/ask.js')).default

const server = http.createServer(async (req, res) => {
  const parsed = url.parse(req.url)
  if (parsed.pathname === '/api/openrouter') return openrouter(req, res)
  if (parsed.pathname === '/api/agent/find') return find(req, res)
  if (parsed.pathname === '/api/agent/extract') return extract(req, res)
  if (parsed.pathname === '/api/agent/ask') return ask(req, res)

  res.statusCode = 404
  res.end('not found')
})

server.listen(4000, () => console.log('Test server listening on http://localhost:4000'))
