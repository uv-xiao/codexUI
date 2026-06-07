import { mkdir, mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  listLearningSeries,
  loadLearningContentConfig,
  readLearningNote,
  resolveLearningApiRequest,
} from './learningContent'
import type { ExtensionRegistry } from '../extensions/extensionRegistry'

async function createLearningFixture(): Promise<{ dir: string; configPath: string }> {
  const dir = await mkdtemp(join(tmpdir(), 'codexui-learning-'))
  await mkdir(join(dir, 'notes', 'cs336'), { recursive: true })
  await writeFile(join(dir, 'codexui.learning.toml'), [
    'id = "notes"',
    'title = "Learning"',
    '',
    '[content]',
    'root = "."',
    'notes_dir = "notes"',
    'assets_dir = "assets"',
    '',
    '[jupyter]',
    'enabled = true',
    'preferred_ui = "lab"',
  ].join('\n'), 'utf8')
  await writeFile(join(dir, 'notes', 'cs336', 'index.md'), '# CS336\n\nOverview.', 'utf8')
  await writeFile(join(dir, 'notes', 'cs336', '00-whole-stack.ipynb'), JSON.stringify({
    cells: [
      { cell_type: 'markdown', source: ['# Whole Stack\n\nText.'] },
      { cell_type: 'code', source: ['print(2 + 2)\n'] },
    ],
    metadata: { language_info: { name: 'python' } },
  }), 'utf8')
  return { dir, configPath: join(dir, 'codexui.learning.toml') }
}

describe('learning content source', () => {
  it('loads a TOML source config relative to the config file', async () => {
    const fixture = await createLearningFixture()
    const config = loadLearningContentConfig(fixture.configPath)

    expect(config.rootDir).toBe(fixture.dir)
    expect(config.notesDir).toBe(join(fixture.dir, 'notes'))
    expect(config.jupyter.preferredUi).toBe('lab')
  })

  it('scans markdown and ipynb notes into series summaries', async () => {
    const fixture = await createLearningFixture()
    const config = loadLearningContentConfig(fixture.configPath)
    const series = listLearningSeries(config)

    expect(series).toEqual([
      {
        id: 'cs336',
        title: 'CS336',
        count: 2,
        notes: [
          { slug: 'cs336/00-whole-stack', title: 'Whole Stack', type: 'notebook', path: 'notes/cs336/00-whole-stack.ipynb' },
          { slug: 'cs336/index', title: 'CS336', type: 'markdown', path: 'notes/cs336/index.md' },
        ],
      },
    ])
  })

  it('adapts ipynb cells to markdown for codexUI rendering', async () => {
    const fixture = await createLearningFixture()
    const config = loadLearningContentConfig(fixture.configPath)
    const note = readLearningNote(config, 'cs336/00-whole-stack')

    expect(note.type).toBe('notebook')
    expect(note.markdown).toContain('# Whole Stack')
    expect(note.markdown).toContain('```python\nprint(2 + 2)\n```')
    expect(note.jupyterPath).toBe('notes/cs336/00-whole-stack.ipynb')
  })

  it('serves sidebar data through the learning API contract', async () => {
    const fixture = await createLearningFixture()
    const registry: ExtensionRegistry = {
      extensions: [{
        id: 'notes',
        name: 'Notes',
        settings: { learningConfig: fixture.configPath },
        routes: [{ id: 'home', label: 'Learning', kind: 'learning', url: '' }],
        sidebar: [{ label: 'Learning', routeId: 'home', itemsUrl: '/codex-api/learning/notes/sidebar' }],
      }],
      errors: [],
    }

    const result = await resolveLearningApiRequest(
      'GET',
      '/codex-api/learning/notes/sidebar',
      new URLSearchParams(),
      () => registry,
    )

    expect(result).toMatchObject({
      handled: true,
      status: 200,
      payload: {
        data: [
          {
            id: 'cs336',
            label: 'CS336',
            kind: 'series',
            count: 2,
          },
        ],
      },
    })
  })
})
