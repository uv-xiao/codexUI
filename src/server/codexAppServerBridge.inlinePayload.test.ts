import { existsSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { mergeRecoveredTurnItemsIntoThreadResult, sanitizeThreadTurnsInlinePayloads } from './codexAppServerBridge'

const pngBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII='
const pngDataUrl = `data:image/png;base64,${pngBase64}`
const gifBase64 = 'R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='
const jpegBase64 = '/9j/4AAQSkZJRgABAQAAAQABAAD/2w=='
const webpBase64 = 'UklGRiIAAABXRUJQVlA4IC4AAAAwAQCdASoBAAEAAQAcJaQAA3AA/vuUAAA='

function localImagePathFromProxyUrl(value: string): string {
  const parsed = new URL(value, 'http://localhost')
  expect(parsed.pathname).toBe('/codex-local-image')
  const imagePath = parsed.searchParams.get('path')
  expect(imagePath).toBeTruthy()
  return imagePath ?? ''
}

describe('thread inline media sanitization', () => {
  it('externalizes inline image data from common thread payload fields', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'user-1',
                type: 'userMessage',
                content: [{ type: 'image', url: pngDataUrl }],
                images: [pngDataUrl],
              },
              {
                id: 'generated-1',
                type: 'imageGeneration',
                result: pngBase64,
              },
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                result: pngBase64,
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<Record<string, unknown>>
        }>
      }
    }

    const [userMessage, generatedImage, toolOutput] = result.thread.turns[0].items
    const content = userMessage.content as Array<Record<string, unknown>>
    const images = userMessage.images as string[]

    expect(content[0].url).toMatch(/^\/codex-local-image\?path=/)
    expect(images[0]).toMatch(/^\/codex-local-image\?path=/)
    expect(generatedImage.type).toBe('imageView')
    expect(generatedImage.path).toEqual(expect.any(String))
    expect(toolOutput.result).toMatch(/^\/codex-local-image\?path=/)

    expect(existsSync(localImagePathFromProxyUrl(content[0].url as string))).toBe(true)
    expect(existsSync(localImagePathFromProxyUrl(images[0]))).toBe(true)
    expect(existsSync(generatedImage.path as string)).toBe(true)
    expect(existsSync(localImagePathFromProxyUrl(toolOutput.result as string))).toBe(true)
  })

  it('leaves non-image result strings untouched', async () => {
    const textResult = 'a'.repeat(128)
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                result: textResult,
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<{ result: string }>
        }>
      }
    }

    expect(result.thread.turns[0].items[0].result).toBe(textResult)
  })

  it('leaves non-image data URLs untouched in image-like fields', async () => {
    const dataUrl = 'data:text/plain;base64,aGVsbG8='
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                result: dataUrl,
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<{ result: string }>
        }>
      }
    }

    expect(result.thread.turns[0].items[0].result).toBe(dataUrl)
  })

  it('externalizes supported bare base64 image signatures with matching extensions', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                images: [jpegBase64, webpBase64, gifBase64],
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<{ images: string[] }>
        }>
      }
    }

    const images = result.thread.turns[0].items[0].images
    expect(images).toHaveLength(3)
    expect(images.every((image) => image.startsWith('/codex-local-image?path='))).toBe(true)

    const [jpegPath, webpPath, gifPath] = images.map(localImagePathFromProxyUrl)
    expect(jpegPath.endsWith('.jpg')).toBe(true)
    expect(webpPath.endsWith('.webp')).toBe(true)
    expect(gifPath.endsWith('.gif')).toBe(true)
    expect(existsSync(jpegPath)).toBe(true)
    expect(existsSync(webpPath)).toBe(true)
    expect(existsSync(gifPath)).toBe(true)
  })

  it('externalizes nested replacement history image URLs', async () => {
    const result = await sanitizeThreadTurnsInlinePayloads('thread/read', {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'message-1',
                type: 'message',
                replacement_history: [
                  {
                    content: [
                      {
                        type: 'image',
                        image_url: pngDataUrl,
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      },
    }) as {
      thread: {
        turns: Array<{
          items: Array<{
            replacement_history: Array<{
              content: Array<{ image_url: string }>
            }>
          }>
        }>
      }
    }

    const imageUrl = result.thread.turns[0].items[0].replacement_history[0].content[0].image_url
    expect(imageUrl).toMatch(/^\/codex-local-image\?path=/)
    expect(existsSync(localImagePathFromProxyUrl(imageUrl))).toBe(true)
  })

  it('does not sanitize inline images for methods without thread turns', async () => {
    const payload = {
      thread: {
        turns: [
          {
            id: 'turn-1',
            items: [
              {
                id: 'tool-output-1',
                type: 'functionCallOutput',
                result: pngBase64,
              },
            ],
          },
        ],
      },
    }

    const result = await sanitizeThreadTurnsInlinePayloads('thread/list', payload)

    expect(result).toBe(payload)
  })
})

describe('thread recovered item merge', () => {
  it('adds captured command executions back into thread turn results', () => {
    const payload = {
      thread: {
        id: 'thread-1',
        turns: [
          {
            id: 'turn-1',
            items: [
              { id: 'user-1', type: 'userMessage', text: 'run tests' },
            ],
          },
        ],
      },
    }

    const result = mergeRecoveredTurnItemsIntoThreadResult(payload, (threadId, turns) => {
      expect(threadId).toBe('thread-1')
      return turns.map((turn) => {
        const record = turn as { id: string, items: Record<string, unknown>[] }
        if (record.id !== 'turn-1') return turn
        return {
          ...record,
          items: [
            ...record.items,
            {
              id: 'cmd-1',
              type: 'commandExecution',
              command: 'npm test',
              status: 'completed',
              aggregatedOutput: 'ok',
              exitCode: 0,
            },
          ],
        }
      })
    }) as {
      thread: {
        turns: Array<{
          items: Array<Record<string, unknown>>
        }>
      }
    }

    expect(result.thread.turns[0].items).toEqual([
      { id: 'user-1', type: 'userMessage', text: 'run tests' },
      {
        id: 'cmd-1',
        type: 'commandExecution',
        command: 'npm test',
        status: 'completed',
        aggregatedOutput: 'ok',
        exitCode: 0,
      },
    ])
  })

  it('repositions recovered command executions using the session log order', () => {
    const payload = {
      thread: {
        id: 'thread-1',
        turns: [
          {
            id: 'turn-1',
            items: [
              { id: 'user-1', type: 'userMessage', text: 'run tests' },
              { id: 'agent-1', type: 'agentMessage', text: 'thinking' },
              {
                id: 'cmd-1',
                type: 'commandExecution',
                command: 'npm test',
                status: 'completed',
                aggregatedOutput: 'ok',
                exitCode: 0,
              },
              { id: 'agent-2', type: 'agentMessage', text: 'done' },
            ],
          },
        ],
      },
    }

    const sessionLogRaw = [
      JSON.stringify({ type: 'turn_context', payload: { turn_id: 'turn-1' } }),
      JSON.stringify({
        type: 'response_item',
        payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'thinking' }] },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'function_call',
          name: 'exec_command',
          call_id: 'call-1',
          arguments: '{"cmd":"npm test"}',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: {
          type: 'function_call_output',
          call_id: 'call-1',
          output: 'Process exited with code 0\nWall time: 0.1 seconds\nOutput:\nok',
        },
      }),
      JSON.stringify({
        type: 'response_item',
        payload: { type: 'message', role: 'assistant', content: [{ type: 'output_text', text: 'done' }] },
      }),
    ].join('\n')

    const result = mergeRecoveredTurnItemsIntoThreadResult(
      payload,
      (_threadId, turns) => turns,
      sessionLogRaw,
    ) as {
      thread: {
        turns: Array<{
          items: Array<Record<string, unknown>>
        }>
      }
    }

    expect(result.thread.turns[0].items.map((item) => item.id)).toEqual([
      'user-1',
      'agent-1',
      'cmd-1',
      'agent-2',
    ])
  })

  it('keeps the original result when no recovered items are available', () => {
    const payload = {
      thread: {
        id: 'thread-1',
        turns: [
          {
            id: 'turn-1',
            items: [],
          },
        ],
      },
    }

    const result = mergeRecoveredTurnItemsIntoThreadResult(payload, (_threadId, turns) => turns)

    expect(result).toBe(payload)
  })

  it('keeps the original result when the merger only recreates the turn array', () => {
    const payload = {
      thread: {
        id: 'thread-1',
        turns: [
          {
            id: 'turn-1',
            items: [
              { id: 'cmd-1', type: 'commandExecution' },
            ],
          },
        ],
      },
    }

    const result = mergeRecoveredTurnItemsIntoThreadResult(payload, (_threadId, turns) => [...turns])

    expect(result).toBe(payload)
  })
})
