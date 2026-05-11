import { describe, expect, it } from 'vitest'
import {
  extractComposerFileMentionAttachments,
  formatComposerFileMention,
  insertComposerFileMentionText,
  toComposerFileMentionSearchQuery,
} from './composerFileMentions'

describe('composerFileMentions', () => {
  it('formats plain relative paths as inline ./ mentions', () => {
    expect(formatComposerFileMention('repos/codexUI')).toBe('./repos/codexUI')
  })

  it('quotes paths with spaces so the mention remains parseable', () => {
    expect(formatComposerFileMention('New Project/app file.ts')).toBe('./"New Project/app file.ts"')
  })

  it('inserts a trailing space after inline mentions', () => {
    expect(insertComposerFileMentionText('', 'repos/codexUI', 0)).toEqual({
      text: './repos/codexUI ',
      selectionIndex: 16,
    })
  })

  it('keeps the cursor after existing whitespace when replacing a mention', () => {
    expect(insertComposerFileMentionText('Read @instalconf now', 'install-configs.py', 5, 16)).toEqual({
      text: 'Read ./install-configs.py now',
      selectionIndex: 26,
    })
  })

  it('treats leading slashes in mention search text as relative prefixes', () => {
    expect(toComposerFileMentionSearchQuery('/src/App')).toBe('src/App')
    expect(toComposerFileMentionSearchQuery('/')).toBe('')
    expect(toComposerFileMentionSearchQuery('src/App')).toBe('src/App')
  })

  it('extracts inline ./ mentions as file attachments', () => {
    const attachments = extractComposerFileMentionAttachments(
      'Read ./repos/codexUI and ./"New Project/app file.ts", then ignore user@example.com.',
      '/root/work/project',
    )

    expect(attachments).toEqual([
      { label: 'codexUI', path: 'repos/codexUI', fsPath: '/root/work/project/repos/codexUI' },
      {
        label: 'app file.ts',
        path: 'New Project/app file.ts',
        fsPath: '/root/work/project/New Project/app file.ts',
      },
    ])
  })

  it('does not treat @/ as an absolute-path mode', () => {
    const attachments = extractComposerFileMentionAttachments('Open @/src/App.vue', '/root/work/project')

    expect(attachments).toEqual([
      { label: 'App.vue', path: 'src/App.vue', fsPath: '/root/work/project/src/App.vue' },
    ])
  })
})
