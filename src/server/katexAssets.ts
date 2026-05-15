import { createRequire } from 'node:module'
import { dirname, extname, resolve, sep } from 'node:path'

const require = createRequire(import.meta.url)

export const KATEX_ASSET_ROUTE = '/codex-local-katex'
export const KATEX_STYLESHEET_HREF = `${KATEX_ASSET_ROUTE}/katex.min.css`

const katexPackagePath = require.resolve('katex/package.json')
export const KATEX_DIST_DIR = resolve(dirname(katexPackagePath), 'dist')

const KATEX_DIST_ROOT = `${KATEX_DIST_DIR}${sep}`

export function resolveKatexAssetPath(requestPath: string): string | null {
  const rawPath = requestPath.replace(/^\/+/u, '')
  let decodedPath = ''
  try {
    decodedPath = decodeURIComponent(rawPath)
  } catch {
    return null
  }
  if (!decodedPath || decodedPath.includes('\0')) return null

  const resolvedPath = resolve(KATEX_DIST_DIR, decodedPath)
  if (resolvedPath !== KATEX_DIST_DIR && !resolvedPath.startsWith(KATEX_DIST_ROOT)) {
    return null
  }
  return resolvedPath
}

export function getKatexAssetContentType(assetPath: string): string {
  switch (extname(assetPath).toLowerCase()) {
    case '.css': return 'text/css; charset=utf-8'
    case '.ttf': return 'font/ttf'
    case '.woff': return 'font/woff'
    case '.woff2': return 'font/woff2'
    default: return 'application/octet-stream'
  }
}
