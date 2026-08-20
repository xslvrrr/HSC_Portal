import { handleAgentSearchRequest } from '../agentSearchHandler.js';

export default function handler(req, res) {
  return handleAgentSearchRequest(req, res, process.env.OPENROUTER_API_KEY);
}
