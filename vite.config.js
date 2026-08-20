import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import { handleOpenRouterRequest } from './openrouterHandler.js'
import { handleAgentSearchRequest } from './agentSearchHandler.js'
import findAgentHandler from './api/agent/find.js'
import extractAgentHandler from './api/agent/extract.js'
import askAgentHandler from './api/agent/ask.js'
import paperContextHandler from './api/agent/paper-context.js'
import { handleAgentChatRequest } from './agentChatHandler.js'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')

  return {
    server: {
      host: '0.0.0.0',
      port: 3000,
      allowedHosts: ['.manus.computer'],
    },
    plugins: [
      react(),
      {
        name: 'openrouter-dev-route',
        configureServer(server) {
          // OpenRouter proxy / mock
          server.middlewares.use('/api/openrouter', async (req, res, next) => {
            if (req.method !== 'POST') {
              next()
              return
            }

            await handleOpenRouterRequest(
              req,
              res,
              env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY
            )
          })

          server.middlewares.use('/api/agent-search', async (req, res, next) => {
            if (req.method !== 'POST') {
              next()
              return
            }

            await handleAgentSearchRequest(
              req,
              res,
              env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY
            )
          })

          server.middlewares.use('/api/agent/find', async (req, res, next) => {
            if (req.method !== 'GET') {
              next()
              return
            }

            await findAgentHandler(req, res)
          })

          server.middlewares.use('/api/agent/extract', async (req, res, next) => {
            if (req.method !== 'GET') {
              next()
              return
            }

            await extractAgentHandler(req, res)
          })

          server.middlewares.use('/api/agent/ask', async (req, res, next) => {
            if (req.method !== 'POST') {
              next()
              return
            }

            await askAgentHandler(req, res)
          })

          server.middlewares.use('/api/agent/paper-context', async (req, res, next) => {
            if (req.method !== 'GET') {
              next()
              return
            }

            await paperContextHandler(req, res)
          })

          server.middlewares.use('/api/agent-chat', async (req, res, next) => {
            if (req.method !== 'POST') {
              next()
              return
            }

            await handleAgentChatRequest(
              req,
              res,
              env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY
            )
          })
        },
      },
    ],
  }
})