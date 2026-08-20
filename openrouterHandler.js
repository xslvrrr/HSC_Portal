import { resolveOpenRouterKey } from './openRouterKeyResolver.js';

const DEFAULT_MODEL = 'openrouter/free';

const SYSTEM_PROMPT = [
  'You are a calm HSC study coach for a student revision app.',
  'Use the context provided in the prompt, and do not pretend to have seen the full paper text unless it is included.',
  'Give concise, useful help with clear steps, checklists, and study advice.',
  'Do not use emojis.',
  'Do not be flashy or overly enthusiastic.',
  'Keep the tone plain, calm, and professional.',
  'Avoid unnecessary markdown decoration.',
  'Use short paragraphs or simple bullet points when that improves clarity.',
  'If the user asks for a direct answer to an unseen exam question, explain that you only have the metadata and notes provided and then help as best you can from that context.',
].join(' ');

export async function handleOpenRouterRequest(req, res, apiKey) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }
  try {
    let body = '';
    for await (const chunk of req) body += chunk;

    const parsed = body ? JSON.parse(body) : {};
    const cleanPrompt = String(parsed.prompt || '').trim();
    const cleanContext = String(parsed.context || '').trim();
    const cleanModel = String(parsed.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;
    const keySelection = resolveOpenRouterKey(req, apiKey);
    if (keySelection.error) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: keySelection.error }));
      return;
    }
    const resolvedApiKey = keySelection.key;
    const maxTokens = Number.isFinite(Number(parsed.max_tokens)) ? Number(parsed.max_tokens) : 700;
    const temperature = Number.isFinite(Number(parsed.temperature)) ? Number(parsed.temperature) : 0.4;

    if (!resolvedApiKey) {
      // Fallback to a local mock response when no API key is provided.
      // This enables a fast prototype experience without external API access.
      try {
        const mockAnswer = generateMockAnswer(cleanPrompt || '', cleanContext || '');
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ answer: mockAnswer }));
      } catch (e) {
        console.error('Mock generation error:', e);
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({ error: 'OpenRouter is not configured and mock generation failed.' }));
      }
      return;
    }

    if (!cleanPrompt) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing prompt.' }));
      return;
    }

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resolvedApiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hsc-portal.local',
        'X-Title': 'HSC Portal',
      },
      body: JSON.stringify({
        model: cleanModel,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              'Context from the app:',
              cleanContext || 'No extra app context was provided.',
              '',
              `Request: ${cleanPrompt}`,
            ].join('\n'),
          },
        ],
        max_tokens: maxTokens,
        temperature,
      }),
    });

    const raw = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch (err) {
      // keep raw text fallback
    }

    if (!response.ok) {
      const message = payload?.error?.message || raw || `OpenRouter request failed with status ${response.status}.`;
      res.statusCode = response.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: message }));
      return;
    }

    const answer = payload?.choices?.[0]?.message?.content?.trim();
    if (!answer) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'No response came back from OpenRouter.' }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ answer }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error?.message || 'Unexpected server error.' }));
  }
}

function generateMockAnswer(prompt, context) {
  const p = String(prompt || '').toLowerCase();
  const ctx = String(context || '').trim();

  // Simple heuristics to create a plausible study-help reply.
  if (p.includes('explain') || p.includes('simplify') || p.includes('what does')) {
    const intro = ctx ? `Using the provided context, here's a concise explanation:` : `Here's a concise explanation:`;
    const body = ctx ? `
Context excerpt:
${ctx.split('\n').slice(0,6).join('\n')}

Explanation:` : '\nExplanation:';
    return `${intro}${body}\n1) Read the question carefully.\n2) Identify key terms and definitions.\n3) Break the problem into smaller steps and solve each part.\n\nIf you paste a short excerpt or the specific question text I can give a more focused explanation.`;
  }

  if (p.includes('quiz') || p.includes('question')) {
    return `I'll ask a short question based on the excerpt you provided. (Prototype)\nQ: What is the main concept tested in the excerpt?\nA: [Your answer here]`;
  }

  // Default fallback reply
  return `Prototype AI response: I received your prompt. Provide a short excerpt or question and I'll explain it clearly, give a study note, or ask a follow-up question.`;
}

export { generateMockAnswer };
