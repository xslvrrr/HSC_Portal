import { handleAgentChatRequest } from '../agentChatHandler.js';

export default function handler(req, res) {
  return handleAgentChatRequest(req, res, process.env.OPENROUTER_API_KEY);
}
