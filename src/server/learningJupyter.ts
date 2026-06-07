import { createServer } from 'node:net'
import { randomBytes } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Socket } from 'node:net'
import { resolve } from 'node:path'
import httpProxy from 'http-proxy'
import type { LearningContentConfig } from './learningContent.js'

type JupyterSession = {
  sourceId: string
  rootDir: string
  baseUrl: string
  port: number
  token: string
  process: ChildProcess
  target: string
  ready: Promise<void>
}

const sessions = new Map<string, JupyterSession>()
const proxy = httpProxy.createProxyServer({ ws: true, changeOrigin: true })

proxy.on('error', (error: Error, _req: IncomingMessage, res: ServerResponse | Socket) => {
  console.warn(`[jupyter-proxy] ${error.message}`)
  if ('headersSent' in res) {
    if (!res.headersSent) res.writeHead(502, { 'Content-Type': 'text/plain' })
    res.end('Bad Gateway')
    return
  }
  res.destroy()
})

function findFreePort(startPort: number): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer()
    server.once('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE' || error.code === 'EACCES') {
        findFreePort(startPort + 1).then(resolvePort, reject)
        return
      }
      reject(error)
    })
    server.once('listening', () => {
      const address = server.address()
      const port = address && typeof address === 'object' ? address.port : startPort
      server.close((error) => error ? reject(error) : resolvePort(port))
    })
    server.listen(startPort, '127.0.0.1')
  })
}

function waitForPort(port: number, timeoutMs = 20000): Promise<void> {
  const startedAt = Date.now()
  return new Promise((resolveReady, reject) => {
    const attempt = () => {
      const socket = createServer()
      socket.once('error', () => {
        resolveReady()
      })
      socket.once('listening', () => {
        socket.close(() => {
          if (Date.now() - startedAt >= timeoutMs) {
            reject(new Error('Jupyter did not become ready before the timeout.'))
            return
          }
          setTimeout(attempt, 150)
        })
      })
      socket.listen(port, '127.0.0.1')
    }
    attempt()
  })
}

async function waitForJupyterHttp(target: string, baseUrl: string, token: string, timeoutMs = 20000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  const url = `${target}${baseUrl}api?token=${encodeURIComponent(token)}`
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url)
      await response.arrayBuffer().catch(() => undefined)
      if (response.status < 500) return
    } catch {
      // Jupyter can bind the port before the HTTP app is ready.
    }
    await new Promise((resolveRetry) => setTimeout(resolveRetry, 150))
  }
  throw new Error('Jupyter did not become HTTP-ready before the timeout.')
}

function resolveJupyterCommand(rootDir: string): { command: string; argsPrefix: string[] } {
  const configured = process.env.CODEXUI_JUPYTER_COMMAND?.trim()
  if (configured) return { command: configured, argsPrefix: [] }
  if (existsSync(resolve(rootDir, 'pixi.toml'))) {
    return { command: 'pixi', argsPrefix: ['run', 'jupyter'] }
  }
  return { command: 'jupyter', argsPrefix: [] }
}

function pathForJupyter(path: string, rootDir: string): string {
  const trimmed = path.trim().replace(/^\/+/u, '')
  if (!trimmed) return ''
  const absolute = resolve(rootDir, trimmed)
  const root = resolve(rootDir)
  if (absolute !== root && !absolute.startsWith(`${root}/`)) {
    throw new Error('Notebook path escapes learning root.')
  }
  return trimmed.split('/').map(encodeURIComponent).join('/')
}

async function startSession(sourceId: string, config: LearningContentConfig): Promise<JupyterSession> {
  const existing = sessions.get(sourceId)
  if (existing && existing.rootDir === config.rootDir && existing.process.exitCode === null) {
    await existing.ready
    return existing
  }

  const port = await findFreePort(Number(process.env.CODEXUI_JUPYTER_START_PORT ?? '8890'))
  const token = randomBytes(18).toString('hex')
  const baseUrl = `/codex-learning-jupyter/${encodeURIComponent(sourceId)}/`
  const jupyter = resolveJupyterCommand(config.rootDir)
  const args = [
    ...jupyter.argsPrefix,
    'lab',
    '--no-browser',
    '--ip=127.0.0.1',
    `--port=${port}`,
    `--ServerApp.root_dir=${config.rootDir}`,
    `--ServerApp.base_url=${baseUrl}`,
    `--ServerApp.token=${token}`,
    '--ServerApp.allow_origin=*',
    '--ServerApp.disable_check_xsrf=True',
  ]
  const child = spawn(jupyter.command, args, {
    cwd: config.rootDir,
    env: { ...process.env },
    stdio: ['ignore', 'pipe', 'pipe'],
    detached: false,
  })
  child.stdout.on('data', (chunk) => console.info(`[jupyter:${sourceId}] ${String(chunk).trimEnd()}`))
  child.stderr.on('data', (chunk) => console.warn(`[jupyter:${sourceId}] ${String(chunk).trimEnd()}`))
  child.once('exit', () => {
    if (sessions.get(sourceId)?.process === child) sessions.delete(sourceId)
  })

  const session: JupyterSession = {
    sourceId,
    rootDir: config.rootDir,
    baseUrl,
    port,
    token,
    process: child,
    target: `http://127.0.0.1:${port}`,
    ready: Promise.resolve(),
  }
  session.ready = waitForPort(port).then(() => waitForJupyterHttp(session.target, session.baseUrl, session.token))
  sessions.set(sourceId, session)
  try {
    await session.ready
  } catch (error) {
    if (sessions.get(sourceId) === session) sessions.delete(sourceId)
    child.kill()
    throw error
  }
  return session
}

export async function getLearningJupyterOpenUrl(
  sourceId: string,
  config: LearningContentConfig,
  path: string,
  ui: 'lab' | 'notebook',
): Promise<{ url: string; ui: 'lab' | 'notebook'; port: number }> {
  if (!config.jupyter.enabled) throw new Error('Jupyter is disabled for this learning source.')
  const session = await startSession(sourceId, config)
  const relativePath = pathForJupyter(path, config.rootDir)
  const treePath = relativePath ? `tree/${relativePath}` : 'tree'
  const prefix = ui === 'notebook' ? 'tree' : 'lab/tree'
  const urlPath = ui === 'notebook'
    ? `${session.baseUrl}${treePath}`
    : `${session.baseUrl}${prefix}${relativePath ? `/${relativePath}` : ''}`
  return {
    url: `${urlPath}?token=${encodeURIComponent(session.token)}`,
    ui,
    port: session.port,
  }
}

function sourceIdFromProxyPath(pathname: string): string | null {
  const match = pathname.match(/^\/codex-learning-jupyter\/([^/]+)(?:\/|$)/u)
  return match ? decodeURIComponent(match[1] ?? '') : null
}

function sessionForProxy(pathname: string): JupyterSession | null {
  const sourceId = sourceIdFromProxyPath(pathname)
  return sourceId ? sessions.get(sourceId) ?? null : null
}

export function handleLearningJupyterProxyRequest(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const session = sessionForProxy(url.pathname)
  if (!session) return false
  proxy.web(req, res, { target: session.target })
  return true
}

export function handleLearningJupyterProxyUpgrade(req: IncomingMessage, socket: Socket, head: Buffer): boolean {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const session = sessionForProxy(url.pathname)
  if (!session) return false
  proxy.ws(req, socket, head, { target: session.target })
  return true
}
