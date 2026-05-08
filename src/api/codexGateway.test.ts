import { afterEach, describe, expect, it, vi } from 'vitest'
import { forkThread, listDirectoryComposioConnectors, resumeThread, startThread, startThreadTurn } from './codexGateway'

function mockRpcFetch(): { requests: Array<{ method: string, params: Record<string, unknown> }> } {
  const requests: Array<{ method: string, params: Record<string, unknown> }> = []

  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === 'string'
      ? JSON.parse(init.body) as { method: string, params: Record<string, unknown> }
      : { method: '', params: {} }

    requests.push(body)

    return new Response(JSON.stringify({
      result: {
        turn: {
          id: `turn-${requests.length}`,
        },
      },
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }))

  return { requests }
}

function mockRpcFetchWithResponder(
  responder: (request: { method: string, params: Record<string, unknown> }, index: number) => unknown,
): { requests: Array<{ method: string, params: Record<string, unknown> }> } {
  const requests: Array<{ method: string, params: Record<string, unknown> }> = []

  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    const body = typeof init?.body === 'string'
      ? JSON.parse(init.body) as { method: string, params: Record<string, unknown> }
      : { method: '', params: {} }

    requests.push(body)

    return new Response(JSON.stringify({
      result: responder(body, requests.length - 1),
    }), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    })
  }))

  return { requests }
}

function emptyThreadResult(threadId: string): Record<string, unknown> {
  return {
    model: 'gpt-5.4',
    thread: {
      id: threadId,
      cwd: '/tmp/project',
      preview: '',
      turns: [],
      createdAt: 0,
      updatedAt: 0,
    },
  }
}

describe('startThreadTurn collaboration mode payloads', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends default collaboration mode explicitly after a plan turn', async () => {
    const { requests } = mockRpcFetch()

    await startThreadTurn('thread-1', 'make a plan', [], 'gpt-5.4', 'medium', undefined, [], 'plan')
    await startThreadTurn('thread-1', 'implement it', [], 'gpt-5.4', 'medium', undefined, [], 'default')

    expect(requests).toHaveLength(2)
    expect(requests[0].method).toBe('turn/start')
    expect(requests[0].params.collaborationMode).toEqual({
      mode: 'plan',
      settings: {
        model: 'gpt-5.4',
        reasoning_effort: 'medium',
        developer_instructions: null,
      },
    })
    expect(requests[1].method).toBe('turn/start')
    expect(requests[1].params.collaborationMode).toEqual({
      mode: 'default',
      settings: {
        model: 'gpt-5.4',
        reasoning_effort: 'medium',
        developer_instructions: null,
      },
    })
  })
})

describe('thread history persistence payloads', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('opts thread start, resume, and fork into extended history persistence', async () => {
    const { requests } = mockRpcFetchWithResponder((request) => {
      if (request.method === 'thread/start') return emptyThreadResult('thread-started')
      if (request.method === 'thread/resume') return emptyThreadResult('thread-1')
      if (request.method === 'thread/fork') return emptyThreadResult('thread-forked')
      return {}
    })

    await startThread('/tmp/project', 'gpt-5.4')
    await resumeThread('thread-1')
    await forkThread('thread-1')

    expect(requests.map((request) => request.method)).toEqual([
      'thread/start',
      'thread/resume',
      'thread/fork',
    ])
    expect(requests.every((request) => request.params.persistExtendedHistory === true)).toBe(true)
  })
})

describe('listDirectoryComposioConnectors', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('sends search queries as query params expected by the server', async () => {
    const requests: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      requests.push(String(input))
      return new Response(JSON.stringify({
        data: [],
        nextCursor: null,
        total: 0,
      }), {
        status: 200,
        headers: {
          'Content-Type': 'application/json',
        },
      })
    }))

    await listDirectoryComposioConnectors('instagram', '50', 25)

    expect(requests).toEqual(['/codex-api/composio/connectors?query=instagram&cursor=50&limit=25'])
  })
})
