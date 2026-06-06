import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import express from 'express'
import { createExtensionRoutesMiddleware } from './extensionRoutes'

async function withServer(app: express.Express, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const server = app.listen(0)
  await new Promise<void>((resolve) => server.once('listening', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') {
    server.close()
    throw new Error('Expected TCP server address.')
  }

  try {
    await run(`http://127.0.0.1:${address.port}`)
  } finally {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve())
    })
  }
}

async function writeExtensionsConfig(config: unknown): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'codexui-extensions-'))
  const path = join(dir, 'extensions.json')
  await writeFile(path, JSON.stringify(config), 'utf8')
  return path
}

describe('extension routes middleware', () => {
  const originalConfigPath = process.env.CODEXUI_EXTENSIONS_CONFIG

  afterEach(() => {
    if (originalConfigPath === undefined) {
      delete process.env.CODEXUI_EXTENSIONS_CONFIG
    } else {
      process.env.CODEXUI_EXTENSIONS_CONFIG = originalConfigPath
    }
  })

  it('loads configured extensions and accepts structured Codex bridge requests', async () => {
    process.env.CODEXUI_EXTENSIONS_CONFIG = await writeExtensionsConfig({
      extensions: [
        {
          id: 'notes',
          settings: { runtimeBaseUrl: 'http://127.0.0.1:5173' },
          manifest: {
            id: 'notes',
            name: 'Notes',
            routes: [{ id: 'home', label: 'Learning', url: '/codexui-extension/' }],
            sidebar: [{ label: 'Learning', routeId: 'home', itemsUrl: '/api/codexui/sidebar' }],
          },
        },
      ],
    })

    const app = express()
    app.use('/codex-api/extensions', createExtensionRoutesMiddleware())

    await withServer(app, async (baseUrl) => {
      const registryResponse = await fetch(`${baseUrl}/codex-api/extensions`)
      await expect(registryResponse.json()).resolves.toMatchObject({
        data: {
          extensions: [
            {
              id: 'notes',
              routes: [{ id: 'home', url: 'http://127.0.0.1:5173/codexui-extension/' }],
              sidebar: [{ label: 'Learning', routeId: 'home', itemsUrl: 'http://127.0.0.1:5173/api/codexui/sidebar' }],
            },
          ],
          errors: [],
        },
      })

      const bridgeResponse = await fetch(`${baseUrl}/codex-api/extensions/notes/codex/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ context: { kind: 'notebook-cell-help' } }),
      })

      expect(bridgeResponse.status).toBe(202)
      await expect(bridgeResponse.json()).resolves.toEqual({
        data: {
          accepted: true,
          extensionId: 'notes',
          kind: 'notebook-cell-help',
          bridge: 'codex-extension-bridge-stub',
        },
      })
    })
  })

  it('isolates extension load errors from valid extensions', async () => {
    process.env.CODEXUI_EXTENSIONS_CONFIG = await writeExtensionsConfig({
      extensions: [
        { id: 'broken', path: '/definitely/missing' },
        {
          id: 'notes',
          manifest: {
            id: 'notes',
            name: 'Notes',
            routes: [{ id: 'home', label: 'Learning', url: 'http://127.0.0.1:5173/codexui-extension/' }],
            sidebar: [{ label: 'Learning', routeId: 'home' }],
          },
        },
      ],
    })

    const app = express()
    app.use('/codex-api/extensions', createExtensionRoutesMiddleware())

    await withServer(app, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/codex-api/extensions`)
      const payload = await response.json()

      expect(payload.data.extensions.map((extension: { id: string }) => extension.id)).toEqual(['notes'])
      expect(payload.data.errors.some((error: { id: string }) => error.id === 'broken')).toBe(true)
    })
  })
})
