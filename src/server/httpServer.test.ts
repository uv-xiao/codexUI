import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { Server as HttpServer } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'
import { createServer } from './httpServer'

let tempDir = ''
let httpServer: HttpServer | null = null
let serverInstance: ReturnType<typeof createServer> | null = null

afterEach(async () => {
  if (httpServer) {
    await new Promise<void>((resolve, reject) => {
      httpServer?.close((error) => {
        if (error) {
          reject(error)
          return
        }
        resolve()
      })
    })
    httpServer = null
  }

  if (serverInstance) {
    serverInstance.dispose()
    serverInstance = null
  }

  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true })
    tempDir = ''
  }
})

async function startServer(): Promise<string> {
  serverInstance = createServer()
  httpServer = serverInstance.app.listen(0)
  await new Promise<void>((resolve, reject) => {
    httpServer?.once('listening', () => resolve())
    httpServer?.once('error', reject)
  })

  const address = httpServer.address()
  if (!address || typeof address === 'string') {
    throw new Error('Expected an ephemeral port.')
  }

  return `http://127.0.0.1:${String(address.port)}`
}

describe('local browse redirect behavior', () => {
  it('redirects editable files to the local editor from browse URLs', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'codexui-http-server-'))
    const filePath = join(tempDir, 'note.txt')
    await writeFile(filePath, 'hello world\n', 'utf8')

    const baseUrl = await startServer()
    const response = await fetch(`${baseUrl}/codex-local-browse${encodeURI(filePath)}`, {
      redirect: 'manual',
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`/codex-local-edit${encodeURI(filePath)}`)
  })

  it('preserves line ranges when redirecting editable browse URLs', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'codexui-http-server-lines-'))
    const filePath = join(tempDir, 'note.txt')
    await writeFile(filePath, 'hello world\nnext line\n', 'utf8')

    const baseUrl = await startServer()
    const response = await fetch(`${baseUrl}/codex-local-browse${encodeURI(filePath)}?line=2-3`, {
      redirect: 'manual',
    })

    expect(response.status).toBe(302)
    expect(response.headers.get('location')).toBe(`/codex-local-edit${encodeURI(filePath)}?line=2-3`)
  })
})
