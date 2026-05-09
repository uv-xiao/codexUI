import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createMarkdownPreviewHtml, createTextEditorHtml, isMarkdownPath } from './localBrowseUi'

let tempDir = ''

afterEach(async () => {
  if (!tempDir) return
  await rm(tempDir, { recursive: true, force: true })
  tempDir = ''
})

describe('local browse markdown preview', () => {
  it('recognizes markdown files for preview support', () => {
    expect(isMarkdownPath('/tmp/note.md')).toBe(true)
    expect(isMarkdownPath('/tmp/note.markdown')).toBe(true)
    expect(isMarkdownPath('/tmp/note.txt')).toBe(false)
  })

  it('shows preview controls only for markdown editor pages', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'codexui-local-preview-'))
    const markdownPath = join(tempDir, 'note.md')
    const textPath = join(tempDir, 'note.txt')
    await writeFile(markdownPath, '# Preview me\n', 'utf8')
    await writeFile(textPath, 'plain text\n', 'utf8')

    const markdownEditorHtml = await createTextEditorHtml(markdownPath)
    expect(markdownEditorHtml).toContain('id="previewBtn"')
    expect(markdownEditorHtml).toContain('id="previewFrame"')
    expect(markdownEditorHtml).toContain('/codex-local-preview')

    const textEditorHtml = await createTextEditorHtml(textPath)
    expect(textEditorHtml).not.toContain('id="previewBtn"')
    expect(textEditorHtml).not.toContain('id="previewFrame"')
  })

  it('renders markdown preview HTML with local links, images, and code blocks', () => {
    const html = createMarkdownPreviewHtml('/tmp/preview space/note.md', `
# Preview Title

[Docs](./docs/readme.md)

![Diagram](./assets/diagram.png)

\`\`\`ts
const enabled: boolean = true
\`\`\`
`)

    expect(html).toContain('message-heading message-heading-h1')
    expect(html).toContain('class="message-file-link"')
    expect(html).toContain('href="/codex-local-browse/tmp/preview%20space/docs/readme.md"')
    expect(html).toContain('class="message-image-preview message-markdown-image"')
    expect(html).toContain('src="/codex-local-image?path=%2Ftmp%2Fpreview%20space%2Fassets%2Fdiagram.png"')
    expect(html).toContain('message-code-block')
    expect(html).toContain('language-ts')
  })
})
