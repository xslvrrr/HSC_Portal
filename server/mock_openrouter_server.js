import http from 'http';
import { handleOpenRouterRequest } from '../openrouterHandler.js';

const PORT = process.env.PORT || 5174;

const server = http.createServer((req, res) => {
  if (req.url === '/api/openrouter' && req.method === 'POST') {
    // Call handler with no API key so it uses the mock path
    handleOpenRouterRequest(req, res, null).catch(err => {
      res.statusCode = 500;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: String(err) }));
    });
    return;
  }

  res.statusCode = 404;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify({ error: 'Not found' }));
});

server.listen(PORT, () => {
  console.log(`Mock OpenRouter server listening on http://localhost:${PORT}/api/openrouter`);
});
