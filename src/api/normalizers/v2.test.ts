import { describe, expect, it } from 'vitest'
import { normalizeThreadGroupsV2 } from './v2'
import type { ThreadListResponse } from '../appServerDtos'

describe('normalizeThreadGroupsV2', () => {
  it('preserves thread model providers from thread list summaries', () => {
    const payload: ThreadListResponse = {
      data: [
        {
          id: 'thread-1',
          preview: 'Moon session',
          modelProvider: 'moon',
          createdAt: 1710000000,
          updatedAt: 1710000300,
          path: null,
          cwd: '/tmp/project',
          cliVersion: '0.130.0',
          source: 'appServer',
          gitInfo: null,
          turns: [],
        },
      ],
      nextCursor: null,
    }

    const groups = normalizeThreadGroupsV2(payload)

    expect(groups).toHaveLength(1)
    expect(groups[0]?.threads[0]?.modelProvider).toBe('moon')
  })
})
