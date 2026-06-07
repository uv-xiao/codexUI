import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve, sep } from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import express from 'express'
import type { RegisteredExtension, ExtensionRegistry } from '../extensions/extensionRegistry.js'
import { loadExtensionRegistry } from './extensionRoutes.js'
import { getLearningJupyterOpenUrl } from './learningJupyter.js'

export type LearningContentConfig = {
  id: string
  title: string
  configPath: string
  rootDir: string
  notesDir: string
  assetsDir: string
  jupyter: {
    enabled: boolean
    preferredUi: 'lab' | 'notebook'
  }
}

export type LearningNoteSummary = {
  slug: string
  title: string
  type: 'markdown' | 'notebook'
  path: string
}

export type LearningSeriesSummary = {
  id: string
  title: string
  count: number
  notes: LearningNoteSummary[]
}

export type LearningNotePayload = LearningNoteSummary & {
  seriesId: string
  markdown: string
  sourcePath: string
  jupyterPath: string
}

export type LearningApiResult =
  | { handled: false }
  | { handled: true; status: number; payload: unknown }

type TomlTable = Record<string, Record<string, string | boolean>>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readString(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : fallback
}

function readBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback
}

function parseTomlScalar(value: string): string | boolean {
  const trimmed = value.trim()
  if (trimmed === 'true') return true
  if (trimmed === 'false') return false
  const quoted = trimmed.match(/^"([\s\S]*)"$/u)
  if (quoted) return quoted[1]?.replace(/\\"/gu, '"') ?? ''
  return trimmed
}

export function parseLearningToml(text: string): TomlTable {
  const tables: TomlTable = { root: {} }
  let current = 'root'
  for (const rawLine of text.split(/\r?\n/u)) {
    const line = rawLine.replace(/\s+#.*$/u, '').trim()
    if (!line) continue
    const section = line.match(/^\[([a-zA-Z0-9_.-]+)\]$/u)
    if (section) {
      current = section[1] ?? 'root'
      tables[current] ??= {}
      continue
    }
    const assignment = line.match(/^([a-zA-Z0-9_.-]+)\s*=\s*(.+)$/u)
    if (!assignment) continue
    tables[current] ??= {}
    tables[current][assignment[1] ?? ''] = parseTomlScalar(assignment[2] ?? '')
  }
  return tables
}

export function loadLearningContentConfig(configPath: string): LearningContentConfig {
  const absoluteConfigPath = resolve(configPath)
  const parsed = parseLearningToml(readFileSync(absoluteConfigPath, 'utf8'))
  const root = parsed.root ?? {}
  const content = parsed.content ?? {}
  const jupyter = parsed.jupyter ?? {}
  const rootDir = resolve(dirname(absoluteConfigPath), readString(content.root, '.'))
  const preferredUi = readString(jupyter.preferred_ui, 'lab') === 'notebook' ? 'notebook' : 'lab'
  return {
    id: readString(root.id, basename(rootDir)),
    title: readString(root.title, 'Learning'),
    configPath: absoluteConfigPath,
    rootDir,
    notesDir: resolve(rootDir, readString(content.notes_dir, 'notes')),
    assetsDir: resolve(rootDir, readString(content.assets_dir, 'assets')),
    jupyter: {
      enabled: readBoolean(jupyter.enabled, true),
      preferredUi,
    },
  }
}

export function learningConfigPathForExtension(extension: RegisteredExtension): string | null {
  const configured = extension.settings.learningConfig
  return typeof configured === 'string' && configured.trim().length > 0 ? configured.trim() : null
}

export function loadLearningConfigForExtension(extension: RegisteredExtension): LearningContentConfig | null {
  const configPath = learningConfigPathForExtension(extension)
  if (!configPath) return null
  return loadLearningContentConfig(configPath)
}

function assertInside(parent: string, child: string): void {
  const relativePath = relative(parent, child)
  if (relativePath.startsWith('..') || relativePath === '..' || relativePath.includes(`..${sep}`)) {
    throw new Error('Path escapes learning content root.')
  }
}

function listNoteFiles(dir: string): string[] {
  if (!existsSync(dir)) return []
  const entries = readdirSync(dir, { withFileTypes: true })
  return entries.flatMap((entry) => {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return listNoteFiles(path)
    if (!entry.isFile()) return []
    const extension = extname(entry.name).toLowerCase()
    return extension === '.md' || extension === '.ipynb' ? [path] : []
  })
}

function titleFromMarkdown(text: string, fallback: string): string {
  const heading = text.match(/^#\s+(.+)$/mu)?.[1]?.trim()
  return heading || fallback
}

function readIpynbSourceArray(source: unknown): string {
  if (Array.isArray(source)) return source.map((entry) => String(entry)).join('')
  return typeof source === 'string' ? source : ''
}

function titleFromNotebook(path: string, fallback: string): string {
  try {
    const notebook = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (!isRecord(notebook) || !Array.isArray(notebook.cells)) return fallback
    for (const cell of notebook.cells) {
      if (!isRecord(cell) || cell.cell_type !== 'markdown') continue
      const title = titleFromMarkdown(readIpynbSourceArray(cell.source), '')
      if (title) return title
    }
  } catch {
    // Fall through to the path-derived title.
  }
  return fallback
}

function titleFromPath(path: string): string {
  const stem = basename(path, extname(path))
  return stem
    .replace(/^\d+[-_]/u, '')
    .replace(/[-_]+/gu, ' ')
    .replace(/\b\w/gu, (match) => match.toUpperCase())
}

function noteSummary(config: LearningContentConfig, path: string): LearningNoteSummary {
  assertInside(config.notesDir, path)
  const relativePath = relative(config.notesDir, path).replace(/\\/gu, '/')
  const slug = relativePath.replace(/\.(md|ipynb)$/iu, '')
  const type = extname(path).toLowerCase() === '.ipynb' ? 'notebook' : 'markdown'
  const fallback = titleFromPath(path)
  return {
    slug,
    title: type === 'markdown'
      ? titleFromMarkdown(readFileSync(path, 'utf8'), fallback)
      : titleFromNotebook(path, fallback),
    type,
    path: relative(config.rootDir, path).replace(/\\/gu, '/'),
  }
}

export function listLearningSeries(config: LearningContentConfig): LearningSeriesSummary[] {
  const files = listNoteFiles(config.notesDir)
  const bySeries = new Map<string, LearningNoteSummary[]>()
  for (const file of files) {
    const summary = noteSummary(config, file)
    const seriesId = summary.slug.split('/')[0] ?? 'notes'
    bySeries.set(seriesId, [...(bySeries.get(seriesId) ?? []), summary])
  }

  return Array.from(bySeries.entries())
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([id, notes]) => {
      const sortedNotes = [...notes].sort((left, right) => left.slug.localeCompare(right.slug))
      const index = sortedNotes.find((note) => note.slug === `${id}/index`)
      return {
        id,
        title: index?.title ?? titleFromPath(id),
        count: sortedNotes.length,
        notes: sortedNotes,
      }
    })
}

function noteFileForSlug(config: LearningContentConfig, slug: string): string {
  const normalizedSlug = slug.replace(/^\/+/u, '').replace(/\.(md|ipynb)$/iu, '')
  const markdownPath = resolve(config.notesDir, `${normalizedSlug}.md`)
  const notebookPath = resolve(config.notesDir, `${normalizedSlug}.ipynb`)
  assertInside(config.notesDir, markdownPath)
  assertInside(config.notesDir, notebookPath)
  if (existsSync(markdownPath) && statSync(markdownPath).isFile()) return markdownPath
  if (existsSync(notebookPath) && statSync(notebookPath).isFile()) return notebookPath
  throw new Error('Learning note not found.')
}

function markdownFromNotebook(path: string): string {
  const notebook = JSON.parse(readFileSync(path, 'utf8')) as unknown
  if (!isRecord(notebook) || !Array.isArray(notebook.cells)) return ''
  const parts: string[] = []
  for (const cell of notebook.cells) {
    if (!isRecord(cell)) continue
    const source = readIpynbSourceArray(cell.source).trimEnd()
    if (cell.cell_type === 'markdown') {
      if (source) parts.push(source)
      continue
    }
    if (cell.cell_type !== 'code') continue
    const language = readString(isRecord(notebook.metadata) && isRecord(notebook.metadata.language_info)
      ? notebook.metadata.language_info.name
      : undefined, 'python')
    parts.push(`\`\`\`${language}\n${source}\n\`\`\``)
  }
  return parts.join('\n\n')
}

export function readLearningNote(config: LearningContentConfig, slug: string): LearningNotePayload {
  const path = noteFileForSlug(config, slug)
  const summary = noteSummary(config, path)
  const seriesId = summary.slug.split('/')[0] ?? 'notes'
  return {
    ...summary,
    seriesId,
    markdown: summary.type === 'notebook' ? markdownFromNotebook(path) : readFileSync(path, 'utf8'),
    sourcePath: path,
    jupyterPath: relative(config.rootDir, path).replace(/\\/gu, '/'),
  }
}

export function learningSidebarNodesForExtension(extension: RegisteredExtension): unknown[] {
  const config = loadLearningConfigForExtension(extension)
  if (!config) return []
  return listLearningSeries(config).map((series) => ({
    id: series.id,
    label: series.title,
    kind: 'series',
    count: series.count,
    selection: { kind: 'series', seriesId: series.id },
    children: series.notes.map((note) => ({
      id: note.slug,
      label: note.title,
      kind: note.type,
      selection: { kind: 'note', seriesId: series.id, slug: note.slug },
    })),
  }))
}

function findLearningExtension(registry: ExtensionRegistry, sourceId: string): RegisteredExtension | null {
  const extension = registry.extensions.find((candidate) => candidate.id === sourceId)
  if (!extension || !learningConfigPathForExtension(extension)) return null
  return extension
}

function getPathParts(pathname: string): string[] | null {
  if (!pathname.startsWith('/codex-api/learning/')) return null
  return pathname.slice('/codex-api/learning/'.length).split('/').filter(Boolean).map(decodeURIComponent)
}

export async function resolveLearningApiRequest(
  method: string | undefined,
  pathname: string,
  searchParams: URLSearchParams,
  registryLoader: () => ExtensionRegistry = loadExtensionRegistry,
): Promise<LearningApiResult> {
  const parts = getPathParts(pathname)
  if (!parts || parts.length < 2) return { handled: false }
  const [sourceId, resource, ...rest] = parts
  const extension = findLearningExtension(registryLoader(), sourceId ?? '')
  if (!extension) return { handled: true, status: 404, payload: { error: 'Learning source is not enabled.' } }
  const config = loadLearningConfigForExtension(extension)
  if (!config) return { handled: true, status: 404, payload: { error: 'Learning source has no config.' } }

  try {
    if (method === 'GET' && resource === 'sidebar') {
      return { handled: true, status: 200, payload: { data: learningSidebarNodesForExtension(extension) } }
    }
    if (method === 'GET' && resource === 'series') {
      return { handled: true, status: 200, payload: { data: listLearningSeries(config) } }
    }
    if (method === 'GET' && resource === 'notes' && rest.length > 0) {
      return { handled: true, status: 200, payload: { data: readLearningNote(config, rest.join('/')) } }
    }
    if (method === 'GET' && resource === 'jupyter' && rest.join('/') === 'open-url') {
      const path = searchParams.get('path') ?? ''
      const ui = searchParams.get('ui') === 'notebook' ? 'notebook' : config.jupyter.preferredUi
      return { handled: true, status: 200, payload: { data: await getLearningJupyterOpenUrl(sourceId ?? '', config, path, ui) } }
    }
  } catch (error) {
    return { handled: true, status: 400, payload: { error: error instanceof Error ? error.message : 'Learning request failed.' } }
  }

  return { handled: false }
}

export function createLearningContentRoutesMiddleware(): express.Router {
  const router = express.Router()
  router.use(async (req, res, next) => {
    const result = await resolveLearningApiRequest(req.method, `/codex-api/learning${req.path}`, new URLSearchParams(req.query as Record<string, string>))
    if (!result.handled) {
      next()
      return
    }
    res.status(result.status).json(result.payload)
  })
  return router
}

export async function handleLearningContentRequest(req: IncomingMessage, res: ServerResponse, url: URL): Promise<boolean> {
  const result = await resolveLearningApiRequest(req.method, url.pathname, url.searchParams)
  if (!result.handled) return false
  res.statusCode = result.status
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(result.payload))
  return true
}
