import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultFreeModeState, getMoonBridgeModelMetadata, getMoonBridgeModels } from './freeMode.js'

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('Moon Bridge catalog loading', () => {
  it('defaults external provider state to disabled', () => {
    expect(createDefaultFreeModeState()).toEqual({
      enabled: false,
      apiKey: null,
      model: 'openrouter/free',
    })
  })

  it('reads model slugs from the generated catalog', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'codexui-moonbridge-'))
    const catalogPath = join(tempDir, 'models_catalog.json')
    try {
      await writeFile(
        catalogPath,
        JSON.stringify({
          models: [
            { slug: 'deepseek-v4-pro', context_window: 128000 },
            { slug: 'deepseek-v4-flash', context_window: '64000' },
            { slug: 'deepseek-v4-pro', context_window: 32000 },
          ],
        }),
        'utf8',
      )

      vi.stubEnv('CODEXUI_MOONBRIDGE_MODEL_CATALOG', catalogPath)

      expect(getMoonBridgeModels()).toEqual(['deepseek-v4-pro', 'deepseek-v4-flash'])
      expect(getMoonBridgeModelMetadata()).toEqual([
        { id: 'deepseek-v4-pro', contextWindow: 128000 },
        { id: 'deepseek-v4-flash', contextWindow: 64000 },
      ])
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
