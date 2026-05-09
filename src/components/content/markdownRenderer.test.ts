import { afterEach, describe, expect, it } from 'vitest'
import * as markdownRenderer from './markdownRenderer'

const baseContext = {
  cwd: '/home/ubuntu/Documents/New Project (2)',
  kind: 'message' as const,
  highlightVersion: 7,
}

function render(text: string, kind: 'message' | 'plan' = 'message'): string {
  return markdownRenderer.renderMarkdownContent(text, {
    ...baseContext,
    kind,
  }).html
}

afterEach(() => {
  markdownRenderer.clearMarkdownRendererCache()
})

describe('renderMarkdownContent', () => {
  it('renders GitHub-style markdown, KaTeX, highlighting, and local file links', () => {
    const html = render(`
# Title

> Quote

- [x] done
- [ ] todo

1. First
2. Second

| A | B |
| :-- | --: |
| ~~1~~ | [src/App.vue](./src/App.vue) and \`inline\` |

Inline math $E = mc^2$ and https://example.com.

\`\`\`js
const answer = 42
\`\`\`
`)

    expect(html).toContain('<h1 class="message-heading message-heading-h1">')
    expect(html).toContain('<blockquote class="message-blockquote">')
    expect(html).toContain('message-task-list')
    expect(html).toContain('class="message-task-checkbox"')
    expect(html).toContain('data-checked="true"')
    expect(html).toContain('class="message-list message-list-ordered"')
    expect(html).toContain('class="message-table-wrap"')
    expect(html).toContain('class="message-table-head-cell"')
    expect(html).toContain('class="message-inline-code"')
    expect(html).toContain('message-file-link')
    expect(html).toContain('href="https://example.com"')
    expect(html).toContain('class="katex"')
    expect(html).toContain('message-code-block')
    expect(html).toContain('hljs')
    expect(html).toContain('message-table-cell')
    expect(html).toContain('src/App.vue')
  })

  it('wraps tight list item inline content in a single text block', () => {
    const html = render('- `repos/codexUI`：`origin/crz/dev` → `18dd52c`')

    expect(html).toContain('<div class="message-list-item-text">')
    expect(html).toContain('<code class="message-inline-code">repos/codexUI</code>：<code class="message-inline-code">origin/crz/dev</code> → <code class="message-inline-code">18dd52c</code>')
  })

  it('does not split ambiguous slash text into absolute tail links', () => {
    const html = render('origin/crz/dev and xx/yy')

    expect(html).toContain('origin/crz/dev and xx/yy')
    expect(html).not.toContain('message-file-link')
    expect(html).not.toContain('title="/crz/dev"')
    expect(html).not.toContain('title="/yy"')
  })

  it('does not split Chinese slash text into absolute tail links', () => {
    const html = render('本地编辑页的系统浅/深色主题、中文字体都正常。')

    expect(html).toContain('系统浅/深色主题')
    expect(html).not.toContain('message-file-link')
    expect(html).not.toContain('title="/深色主题"')
  })

  it('parses local markdown links with spaces in the target', () => {
    const html = render('MARK [hosting_manager.py](/home/ubuntu/Documents/New Project (2)/hosting_manager.py)')

    expect(html).toContain('href="/codex-local-browse/home/ubuntu/Documents/New%20Project%20(2)/hosting_manager.py"')
    expect(html).toContain('title="/home/ubuntu/Documents/New Project (2)/hosting_manager.py"')
    expect(html).toContain('hosting_manager.py')
  })

  it('renders local markdown images through the local image route', () => {
    const html = render('![diagram](/home/ubuntu/Documents/New Project (2)/diagram.png)')

    expect(html).toContain('message-markdown-image')
    expect(html).toContain('message-image-preview')
    expect(html).toContain('src="/codex-local-image?path=%2Fhome%2Fubuntu%2FDocuments%2FNew%20Project%20(2)%2Fdiagram.png"')
    expect(html).toContain('alt="diagram"')
  })

  it('does not rewrite file-like text inside code blocks', () => {
    const html = render('```txt\n[hosting_manager.py](/home/ubuntu/Documents/New Project (2)/hosting_manager.py)\n```')

    expect(html).toContain('message-code-block')
    expect(html).toContain('[hosting_manager.py](/home/ubuntu/Documents/New Project (2)/hosting_manager.py)')
    expect(html).not.toContain('message-file-link')
  })

  it('shares the same renderer for message and plan contexts', () => {
    const text = 'Plan with $a^2 + b^2 = c^2$ and [src/App.vue](./src/App.vue)'
    expect(render(text, 'message')).toBe(render(text, 'plan'))
  })

  it('falls back to escaped text when the processor fails', () => {
    const failingFactory = () => ({
      processSync() {
        throw new Error('boom')
      },
    }) as unknown as ReturnType<typeof markdownRenderer.createMarkdownProcessor>

    const html = markdownRenderer.renderMarkdownContent('<b>unsafe</b>', baseContext, failingFactory).html
    expect(html).toContain('&lt;b&gt;unsafe&lt;/b&gt;')
  })
})
