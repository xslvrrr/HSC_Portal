import { handleOpenRouterRequest } from '../openrouterHandler.js'

export default async function handler(req, res) {
  // Delegate to the shared handler; Vercel will provide process.env
  await handleOpenRouterRequest(req, res, process.env.OPENROUTER_API_KEY)
}
