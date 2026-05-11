import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { createEditorReferenceText, createMarkdownPreviewHtml, createTextEditorHtml, isMarkdownPath } from './localBrowseUi'
import { KATEX_STYLESHEET_HREF } from './katexAssets'

let tempDir = ''

afterEach(async () => {
  if (!tempDir) return
  await rm(tempDir, { recursive: true, force: true })
  tempDir = ''
})

describe('local browse markdown preview', () => {
  it('formats editor references from 1-based line ranges', () => {
    expect(createEditorReferenceText('/tmp/note.md', 3)).toBe('/tmp/note.md:3')
    expect(createEditorReferenceText('/tmp/note.md', 3, 7)).toBe('/tmp/note.md:3-7')
    expect(createEditorReferenceText('/tmp/note.md', 7, 3)).toBe('/tmp/note.md:3-7')
    expect(createEditorReferenceText('/tmp/note.md', 0)).toBe('')
    expect(createEditorReferenceText('   ', 1)).toBe('')
  })

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
    expect(markdownEditorHtml).toContain('id="copyRefBtn"')
    expect(markdownEditorHtml).toContain('id="previewBtn"')
    expect(markdownEditorHtml).toContain('id="previewSplitter"')
    expect(markdownEditorHtml).toContain('role="separator"')
    expect(markdownEditorHtml).toContain('cursor: row-resize')
    expect(markdownEditorHtml).toContain('previewSplitStorageKeyVertical')
    expect(markdownEditorHtml).toContain("const shrinkKey = stacked ? 'ArrowUp' : 'ArrowLeft'")
    expect(markdownEditorHtml).toContain('codex-local-markdown-preview-jump')
    expect(markdownEditorHtml).toContain('handlePreviewJumpMessage')
    expect(markdownEditorHtml).toContain('id="previewFrame"')
    expect(markdownEditorHtml).toContain('/codex-local-preview')
    const referenceHelperIndex = markdownEditorHtml.indexOf('const createEditorReferenceText =')
    expect(referenceHelperIndex).toBeGreaterThan(-1)
    expect(referenceHelperIndex).toBeLessThan(markdownEditorHtml.indexOf('return createEditorReferenceText('))

    const textEditorHtml = await createTextEditorHtml(textPath)
    expect(textEditorHtml).toContain('id="copyRefBtn"')
    expect(textEditorHtml).not.toContain('id="previewBtn"')
    expect(textEditorHtml).not.toContain('id="previewSplitter"')
    expect(textEditorHtml).not.toContain('id="previewFrame"')
  })

  it('uses the Rust Ace mode for Rust editor pages', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'codexui-local-rust-editor-'))
    const rustPath = join(tempDir, 'main.rs')
    await writeFile(rustPath, 'fn main() { println!("hello"); }\n', 'utf8')

    const editorHtml = await createTextEditorHtml(rustPath)

    expect(editorHtml).toContain("editor.session.setMode('ace/mode/rust')")
    expect(editorHtml).toContain('· rust')
  })

  it('binds Ctrl+S to saving in the local editor page', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'codexui-local-save-shortcut-'))
    const textPath = join(tempDir, 'note.txt')
    await writeFile(textPath, 'hello\n', 'utf8')

    const editorHtml = await createTextEditorHtml(textPath)

    expect(editorHtml).toContain('const saveEditorContent = async () =>')
    expect(editorHtml).toContain('const isEditorSaveShortcut = (event) =>')
    expect(editorHtml).toContain("window.addEventListener('keydown'")
    expect(editorHtml).toContain('event.preventDefault()')
    expect(editorHtml).toContain('event.stopPropagation()')
    expect(editorHtml).toContain('capture: true')
    expect(editorHtml).toContain('saveEditorContent();')
  })

  it('renders markdown preview HTML with local links, images, and code blocks', () => {
    const html = createMarkdownPreviewHtml('/tmp/preview space/note.md', [
      '# Preview Title',
      '',
      '[Docs](./docs/readme.md)',
      '',
      '$$',
      'L_0',
      '$$',
      '',
      '![Diagram](./assets/diagram.png)',
      '',
      '```ts',
      'const enabled: boolean = true',
      '```',
    ].join('\n'))

    expect(html).toContain('message-heading message-heading-h1')
    expect(html).toContain('class="message-file-link"')
    expect(html).toContain('href="/codex-local-browse/tmp/preview%20space/docs/readme.md"')
    expect(html).toContain('class="message-image-preview message-markdown-image"')
    expect(html).toContain('src="/codex-local-image?path=%2Ftmp%2Fpreview%20space%2Fassets%2Fdiagram.png"')
    expect(html).toContain('message-code-block')
    expect(html).toContain('language-ts')
    expect(html).toContain('message-math-source-display')
    expect(html).toContain('data-source-line="5"')
    expect(html).toContain('target.nodeType === Node.TEXT_NODE')
    expect(html).toContain('data-source-line=')
    expect(html).toContain('data-source-end-line=')
    expect(html).toContain('codex-local-markdown-preview-jump')
    expect(html).toContain('data-source-line="1"')
  })

  it('links KaTeX assets in standalone markdown preview', () => {
    const html = createMarkdownPreviewHtml('/tmp/preview space/note.md', 'Plain preview')

    expect(html).toContain(`<link rel="stylesheet" href="${KATEX_STYLESHEET_HREF}" />`)
  })
})
