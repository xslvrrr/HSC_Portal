import { resolveOpenRouterKey } from './openRouterKeyResolver.js';

const DEFAULT_MODEL = 'openrouter/free';

const SYSTEM_PROMPT = `You are a search query parser for an HSC (Higher School Certificate) exam portal.
Analyze the user's natural language request and extract the search intent as a JSON object matching this schema:
{
  "subject": string | null, // The EXACT match from the provided subjects list, or null if none match.
  "level": number | null, // Year level: 11, 12, or null. "prelim" or "preliminary" maps to 11. "hsc" or "year 12" maps to 12.
  "category": "H" | "T" | "A" | null, // "H" for Official HSC/NESA, "T" for Trial exams, "A" for Assessment tasks.
  "school": string | null, // The EXACT match from the provided schools list, or null if none match.
  "wantsSolutions": boolean, // true if user specifically asks for solutions, answers, marking guidelines, worked solutions.
  "wantsRecent": boolean, // true if user asks for recent/new/newest/latest papers.
  "wantsOlder": boolean, // true if user asks for old/older/earliest papers.
  "minYear": number | null, // minimum year if a range is asked (e.g. "after 2020" -> minYear=2021).
  "maxYear": number | null, // maximum year if a range is asked (e.g. "before 2022" -> maxYear=2021).
  "years": number[] // array of specific years mentioned (e.g. "2020 and 2022" -> [2020, 2022]).
}

Strictly output ONLY valid JSON. Do not include any explanation or markdown formatting (like \`\`\`json) outside of the JSON.`;

export async function handleAgentSearchRequest(req, res, apiKey) {
  if (req.method !== 'POST') {
    res.statusCode = 405;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Method not allowed' }));
    return;
  }

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

  try {
    let body = '';
    for await (const chunk of req) body += chunk;

    const parsed = body ? JSON.parse(body) : {};
    const query = String(parsed.query || '').trim();
    const subjects = Array.isArray(parsed.subjects) ? parsed.subjects : [];
    const schools = Array.isArray(parsed.schools) ? parsed.schools : [];
    const model = String(parsed.model || DEFAULT_MODEL).trim() || DEFAULT_MODEL;

    if (!query) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing query.' }));
      return;
    }

    const prompt = `User search query: "${query}"

Valid subjects list:
${JSON.stringify(subjects)}

Valid schools list:
${JSON.stringify(schools)}

Extract intent matching the JSON schema.`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${keySelection.key}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://hsc-portal.local',
        'X-Title': 'HSC Portal Agentic Search',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.1,
      }),
    });

    const raw = await response.text();
    let payload = null;
    try {
      payload = JSON.parse(raw);
    } catch {
      // ignore
    }

    if (!response.ok) {
      const message = payload?.error?.message || raw || `OpenRouter request failed with status ${response.status}.`;
      res.statusCode = response.status;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: message }));
      return;
    }

    const answerStr = payload?.choices?.[0]?.message?.content?.trim();
    if (!answerStr) {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'No response came back from OpenRouter.' }));
      return;
    }

    // Parse the JSON string returned by LLM to make sure it's valid JSON
    let intent = null;
    try {
      // Strip markdown code fences if LLM ignored instructions
      const cleanAnswer = answerStr.replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      intent = JSON.parse(cleanAnswer);
    } catch {
      res.statusCode = 502;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'LLM did not return valid JSON.', rawResponse: answerStr }));
      return;
    }

    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ intent }));
  } catch (error) {
    res.statusCode = 500;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: error?.message || 'Unexpected server error.' }));
  }
}
