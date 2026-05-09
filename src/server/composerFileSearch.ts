import { spawn } from 'node:child_process'
import { lstat } from 'node:fs/promises'
import { dirname, isAbsolute, parse, resolve } from 'node:path'
import { normalizePathForUi } from '../pathUtils.js'
import { resolveRipgrepCommand } from '../commandResolution.js'

export type ComposerSearchPathKind = 'file' | 'directory'

export type ComposerSearchPathResult = {
  path: string
  kind: ComposerSearchPathKind
  isSymlink: boolean
}

type ComposerSearchPathCandidate = {
  path: string
  kind: ComposerSearchPathKind
}

function normalizeComposerSearchPath(rawPath: string): string {
  return normalizePathForUi(rawPath)
    .trim()
    .replace(/\\/gu, '/')
    .replace(/^\.[/]+/u, '')
}

function addCandidate(
  candidates: Map<string, ComposerSearchPathCandidate>,
  pathValue: string,
  kind: ComposerSearchPathKind,
): void {
  const path = normalizeComposerSearchPath(pathValue)
  if (!path || path === '.') return
  if (!candidates.has(path)) {
    candidates.set(path, { path, kind })
  }
}

function addAncestorDirectories(
  candidates: Map<string, ComposerSearchPathCandidate>,
  pathValue: string,
): void {
  let current = dirname(pathValue)
  while (current && current !== pathValue) {
    if (current === '.' || current === parse(current).root) break
    addCandidate(candidates, current, 'directory')
    const next = dirname(current)
    if (!next || next === current) break
    current = next
  }
}

export function scoreComposerPathCandidate(path: string, query: string): number {
  if (!query) return 0
  const lowerPath = path.toLowerCase()
  const lowerQuery = query.toLowerCase()
  const normalizedPath = lowerPath.replace(/\\/gu, '/')
  const baseName = normalizedPath.slice(normalizedPath.lastIndexOf('/') + 1)
  if (baseName === lowerQuery) return 0
  if (baseName.startsWith(lowerQuery)) return 1
  if (baseName.includes(lowerQuery)) return 2
  if (normalizedPath.includes(`/${lowerQuery}`)) return 3
  if (normalizedPath.includes(lowerQuery)) return 4
  return 10
}

async function listPathsWithRipgrep(cwd: string): Promise<string[]> {
  return await new Promise<string[]>((resolvePromise, reject) => {
    const ripgrepCommand = resolveRipgrepCommand()
    if (!ripgrepCommand) {
      reject(new Error('ripgrep (rg) is not available'))
      return
    }

    const proc = spawn(ripgrepCommand, ['--files', '--follow', '--hidden', '-g', '!.git', '-g', '!node_modules'], {
      cwd,
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (chunk: Buffer) => { stdout += chunk.toString() })
    proc.stderr.on('data', (chunk: Buffer) => { stderr += chunk.toString() })
    proc.on('error', reject)
    proc.on('close', (code) => {
      if (code === 0) {
        const rows = stdout
          .split(/\r?\n/)
          .map(normalizeComposerSearchPath)
          .filter(Boolean)
        resolvePromise(rows)
        return
      }
      const details = [stderr.trim(), stdout.trim()].filter(Boolean).join('\n')
      reject(new Error(details || 'rg --files failed'))
    })
  })
}

function buildComposerSearchPathCandidates(paths: string[]): ComposerSearchPathCandidate[] {
  const candidates = new Map<string, ComposerSearchPathCandidate>()
  for (const path of paths) {
    addCandidate(candidates, path, 'file')
    addAncestorDirectories(candidates, path)
  }
  return Array.from(candidates.values())
}

async function isSymlinkPath(cwd: string, path: string): Promise<boolean> {
  const absolutePath = isAbsolute(path) ? path : resolve(cwd, path)
  try {
    const info = await lstat(absolutePath)
    return info.isSymbolicLink()
  } catch {
    return false
  }
}

export async function searchComposerPaths(
  cwd: string,
  query: string,
  limit: number,
): Promise<ComposerSearchPathResult[]> {
  const paths = await listPathsWithRipgrep(cwd)
  const trimmedQuery = query.trim()
  const maxResults = Math.max(1, Math.min(100, Math.floor(limit)))
  const candidates = buildComposerSearchPathCandidates(paths)
    .map((candidate) => ({
      ...candidate,
      score: scoreComposerPathCandidate(candidate.path, trimmedQuery),
    }))
    .filter((row) => trimmedQuery.length === 0 || row.score < 10)
    .sort((a, b) => (a.score - b.score) || a.path.localeCompare(b.path))
    .slice(0, maxResults)

  return await Promise.all(candidates.map(async (candidate) => ({
    path: candidate.path,
    kind: candidate.kind,
    isSymlink: await isSymlinkPath(cwd, candidate.path),
  })))
}
