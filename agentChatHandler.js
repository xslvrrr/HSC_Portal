import { resolveOpenRouterKey } from './openRouterKeyResolver.js';

const AGENT_MODEL = 'openrouter/free';

const AGENT_SYSTEM_PROMPT = [
  'You are a smart, efficient HSC study assistant operating inside the HSC Portal.',
  'You have access to a set of tools to help students manage their studies.',
  'When the user asks you to perform an action (search papers, bookmark, schedule events, etc.), use the appropriate tool.',
  'When you have completed the user\'s request, give a brief, plain-language confirmation of what you did.',
  'Do not invent paper IDs or data. Only work with what the tools return.',
  'Keep your final responses concise — one or two sentences at most.',
  'Never use markdown headers or excessive formatting in your final response.',
  'When selected-paper context is supplied, use it to give paper-aware guidance. The supplied PDF text contains every selectable-text page in the selected paper; you may discuss any included page or question, but never invent text that is not present in the supplied paper.',
].join(' ');

/**
 * Handles an agentic chat request, forwarding the full messages + tools payload
 * to OpenRouter and returning the raw completion response.
 *
 * The client-side harness handles the execution loop (tool call -> result -> next turn).
 * This endpoint is a thin, secure proxy that keeps the API key server-side.
 */
export async function handleAgentChatRequest(req, res, apiKey) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

  let body = '';
  try {
    for await (const chunk of req) body += chunk;
  } catch (err) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Failed to read request body.' }));
    return;
  }

  let parsed;
  try {
    parsed = body ? JSON.parse(body) : {};
  } catch {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Invalid JSON body.' }));
    return;
  }

  const { messages, tools, tool_choice } = parsed;
  const keySelection = resolveOpenRouterKey(req, apiKey);

  if (keySelection.error) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: keySelection.error }));
    return;
  }

  if (!keySelection.key) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'AI is not configured. Set OPENROUTER_API_KEY on the server or add a personal key in Customise.' }));
    return;
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    res.statusCode = 400;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Missing or empty messages array.' }));
    return;
  }

  // Inject system prompt as the first message if not already present
  const fullMessages = messages[0]?.role === 'system'
    ? messages
    : [{ role: 'system', content: AGENT_SYSTEM_PROMPT }, ...messages];

  const requestBody = {
    model: AGENT_MODEL,
    messages: fullMessages,
    max_tokens: 1024,
    temperature: 0.2,
  };

  if (Array.isArray(tools) && tools.length > 0) {
    requestBody.tools = tools;
    requestBody.tool_choice = tool_choice || 'auto';
  }

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keySelection.key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hsc-portal.vercel.app',
        'X-Title': 'HSC Portal Agent',
      },
      body: JSON.stringify(requestBody),
    });

    const raw = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      // keep raw fallback
    }

    if (!response.ok) {
      const message = payload?.error?.message || raw || `OpenRouter error: ${response.status}`;
      res.statusCode = response.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: message }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(payload));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error?.message || 'Unexpected server error.' }));
  }
}
