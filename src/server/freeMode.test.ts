import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createDefaultFreeModeState, getMoonBridgeModels } from './freeMode.js'

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
            { slug: 'deepseek-v4-pro' },
            { slug: 'deepseek-v4-flash' },
            { slug: 'deepseek-v4-pro' },
          ],
        }),
        'utf8',
      )

      vi.stubEnv('CODEXUI_MOONBRIDGE_MODEL_CATALOG', catalogPath)

      expect(getMoonBridgeModels()).toEqual(['deepseek-v4-pro', 'deepseek-v4-flash'])
    } finally {
      await rm(tempDir, { recursive: true, force: true })
    }
  })
})
