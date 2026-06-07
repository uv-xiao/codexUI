export type ExtensionSettings = Record<string, unknown>

export type ExtensionConfig = {
  id: string
  enabled?: boolean
  path?: string
  manifest?: unknown
  settings?: ExtensionSettings
}

export type ExtensionRouteManifest = {
  id: string
  label: string
  url?: string
  kind?: 'iframe' | 'learning'
}

export type ExtensionSidebarManifest = {
  label: string
  routeId: string
  subtitle?: string
  itemsUrl?: string
}

export type ExtensionManifest = {
  id: string
  name: string
  version?: string
  routes: ExtensionRouteManifest[]
  sidebar: ExtensionSidebarManifest[]
}

export type RegisteredExtensionRoute = ExtensionRouteManifest & {
  url: string
  kind: 'iframe' | 'learning'
}

export type RegisteredExtensionSidebar = ExtensionSidebarManifest & {
  itemsUrl?: string
}

export type RegisteredExtension = {
  id: string
  name: string
  version?: string
  settings: ExtensionSettings
  routes: RegisteredExtensionRoute[]
  sidebar: RegisteredExtensionSidebar[]
}

export type ExtensionLoadError = {
  id: string
  message: string
}

export type ExtensionRegistry = {
  extensions: RegisteredExtension[]
  errors: ExtensionLoadError[]
}

export type ExtensionConfigFile = {
  extensions?: ExtensionConfig[]
}

const EXTENSION_ID_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readNonEmptyString(record: Record<string, unknown>, key: string): string {
  const value = record[key]
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`Expected non-empty string field "${key}".`)
  }
  return value.trim()
}

function readOptionalString(record: Record<string, unknown>, key: string): string | undefined {
  const value = record[key]
  if (value === undefined || value === null) return undefined
  if (typeof value !== 'string') {
    throw new Error(`Expected string field "${key}".`)
  }
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

function validateExtensionId(id: string): void {
  if (!EXTENSION_ID_PATTERN.test(id)) {
    throw new Error(`Invalid extension id "${id}". Use lower-case letters, numbers, and dashes.`)
  }
}

function parseRoute(value: unknown): ExtensionRouteManifest {
  if (!isRecord(value)) {
    throw new Error('Expected route entries to be objects.')
  }
  const kind = readOptionalString(value, 'kind') ?? 'iframe'
  if (kind !== 'iframe' && kind !== 'learning') {
    throw new Error('Expected route kind to be "iframe" or "learning".')
  }
  const url = readOptionalString(value, 'url')
  if (kind === 'iframe' && !url) {
    throw new Error('Expected non-empty string field "url".')
  }
  return {
    id: readNonEmptyString(value, 'id'),
    label: readNonEmptyString(value, 'label'),
    kind,
    url,
  }
}

function parseSidebar(value: unknown): ExtensionSidebarManifest {
  if (!isRecord(value)) {
    throw new Error('Expected sidebar entries to be objects.')
  }
  return {
    label: readNonEmptyString(value, 'label'),
    routeId: readNonEmptyString(value, 'routeId'),
    subtitle: readOptionalString(value, 'subtitle'),
    itemsUrl: readOptionalString(value, 'itemsUrl'),
  }
}

export function parseExtensionManifest(value: unknown): ExtensionManifest {
  if (!isRecord(value)) {
    throw new Error('Expected extension manifest to be an object.')
  }

  const id = readNonEmptyString(value, 'id')
  validateExtensionId(id)

  const rawRoutes = value.routes
  if (!Array.isArray(rawRoutes) || rawRoutes.length === 0) {
    throw new Error('Expected manifest.routes to contain at least one route.')
  }

  const rawSidebar = value.sidebar
  if (!Array.isArray(rawSidebar) || rawSidebar.length === 0) {
    throw new Error('Expected manifest.sidebar to contain at least one item.')
  }

  return {
    id,
    name: readNonEmptyString(value, 'name'),
    version: readOptionalString(value, 'version'),
    routes: rawRoutes.map(parseRoute),
    sidebar: rawSidebar.map(parseSidebar),
  }
}

function normalizeSettings(value: unknown): ExtensionSettings {
  return isRecord(value) ? { ...value } : {}
}

function resolveRouteUrl(url: string, settings: ExtensionSettings): string {
  if (/^https?:\/\//iu.test(url)) return url
  const baseUrl = settings.baseUrl ?? settings.runtimeBaseUrl
  if (typeof baseUrl !== 'string' || baseUrl.trim().length === 0) return url
  return new URL(url, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString()
}

function resolveOptionalUrl(url: string | undefined, settings: ExtensionSettings): string | undefined {
  return url ? resolveRouteUrl(url, settings) : undefined
}

function routeUrlForRegistry(route: ExtensionRouteManifest, settings: ExtensionSettings): string {
  return resolveOptionalUrl(route.url, settings) ?? ''
}

export function buildExtensionRegistry(configFile: ExtensionConfigFile): ExtensionRegistry {
  const configs = Array.isArray(configFile.extensions) ? configFile.extensions : []
  const extensions: RegisteredExtension[] = []
  const errors: ExtensionLoadError[] = []

  for (const config of configs) {
    const configId = typeof config.id === 'string' ? config.id.trim() : ''
    const errorId = configId || 'unknown'

    try {
      if (!configId) {
        throw new Error('Expected extension config id.')
      }
      validateExtensionId(configId)
      if (config.enabled === false) continue

      const settings = normalizeSettings(config.settings)
      const manifest = parseExtensionManifest(config.manifest)
      if (manifest.id !== configId) {
        throw new Error(`Manifest id "${manifest.id}" does not match config id "${configId}".`)
      }

      const routeIds = new Set(manifest.routes.map((route) => route.id))
      const missingSidebarRoute = manifest.sidebar.find((item) => !routeIds.has(item.routeId))
      if (missingSidebarRoute) {
        throw new Error(`Sidebar route "${missingSidebarRoute.routeId}" is not declared in manifest.routes.`)
      }

      extensions.push({
        id: manifest.id,
        name: manifest.name,
        version: manifest.version,
        settings,
        routes: manifest.routes.map((route) => ({
          ...route,
          kind: route.kind ?? 'iframe',
          url: routeUrlForRegistry(route, settings),
        })),
        sidebar: manifest.sidebar.map((item) => ({
          ...item,
          itemsUrl: resolveOptionalUrl(item.itemsUrl, settings),
        })),
      })
    } catch (error) {
      errors.push({
        id: errorId,
        message: error instanceof Error ? error.message : 'Unknown extension load error.',
      })
    }
  }

  return { extensions, errors }
}
