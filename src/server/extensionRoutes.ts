import { existsSync, readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import express from 'express'
import {
  buildExtensionRegistry,
  type ExtensionConfig,
  type ExtensionConfigFile,
  type ExtensionRegistry,
} from '../extensions/extensionRegistry.js'

const DEFAULT_CONFIG_PATH = join(process.cwd(), '.codexui', 'extensions.json')

function readJsonFile(path: string): unknown {
  return JSON.parse(readFileSync(path, 'utf8'))
}

function resolveConfigPath(): string {
  const configuredPath = process.env.CODEXUI_EXTENSIONS_CONFIG?.trim()
  if (!configuredPath) return DEFAULT_CONFIG_PATH
  if (configuredPath.startsWith('~/')) {
    return join(homedir(), configuredPath.slice(2))
  }
  return resolve(configuredPath)
}

function readExtensionManifest(config: ExtensionConfig): unknown {
  if (config.manifest) return config.manifest
  if (!config.path || config.path.trim().length === 0) {
    throw new Error(`Extension "${config.id}" must define manifest or path.`)
  }
  return readJsonFile(join(resolve(config.path), 'codexui.extension.json'))
}

export function loadExtensionRegistry(): ExtensionRegistry {
  const configPath = resolveConfigPath()
  if (!existsSync(configPath)) {
    return { extensions: [], errors: [] }
  }

  const rawConfig = readJsonFile(configPath) as ExtensionConfigFile
  const configs = Array.isArray(rawConfig.extensions) ? rawConfig.extensions : []
  const enrichedConfig = {
    extensions: configs.map((config) => {
      try {
        return {
          ...config,
          manifest: readExtensionManifest(config),
        }
      } catch (error) {
        return {
          ...config,
          manifest: {
            id: config.id,
            name: config.id,
            routes: [],
            sidebar: [],
          },
          settings: {
            ...config.settings,
            __loadError: error instanceof Error ? error.message : 'Unknown extension load error.',
          },
        }
      }
    }),
  }
  const registry = buildExtensionRegistry(enrichedConfig)
  for (const config of enrichedConfig.extensions) {
    const loadError = config.settings?.__loadError
    if (typeof loadError === 'string') {
      registry.errors.push({ id: config.id, message: loadError })
    }
  }
  return registry
}

export function createExtensionRoutesMiddleware(): express.Router {
  const router = express.Router()

  router.get('/', (_req, res) => {
    res.status(200).json({ data: loadExtensionRegistry() })
  })

  router.post('/:extensionId/codex/ask', express.json({ type: '*/*', limit: '2mb' }), (req, res) => {
    const registry = loadExtensionRegistry()
    const extension = registry.extensions.find((candidate) => candidate.id === req.params.extensionId)
    if (!extension) {
      res.status(404).json({ error: 'Extension is not enabled or could not be loaded.' })
      return
    }

    const body = req.body && typeof req.body === 'object' ? req.body as Record<string, unknown> : {}
    const context = body.context && typeof body.context === 'object' ? body.context as Record<string, unknown> : {}
    const kind = typeof context.kind === 'string' ? context.kind : 'extension-help'
    res.status(202).json({
      data: {
        accepted: true,
        extensionId: extension.id,
        kind,
        bridge: 'codex-extension-bridge-stub',
      },
    })
  })

  return router
}
