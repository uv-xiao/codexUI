import { describe, expect, it } from 'vitest'
import { KATEX_ASSET_ROUTE, KATEX_DIST_DIR, KATEX_STYLESHEET_HREF, getKatexAssetContentType, resolveKatexAssetPath } from './katexAssets'

describe('katexAssets', () => {
  it('resolves KaTeX assets from the packaged dist directory', () => {
    expect(KATEX_ASSET_ROUTE).toBe('/codex-local-katex')
    expect(KATEX_STYLESHEET_HREF).toBe('/codex-local-katex/katex.min.css')
    expect(resolveKatexAssetPath('/katex.min.css')).toBe(`${KATEX_DIST_DIR}/katex.min.css`)
    expect(resolveKatexAssetPath('/fonts/KaTeX_Main-Regular.woff2')).toBe(`${KATEX_DIST_DIR}/fonts/KaTeX_Main-Regular.woff2`)
    expect(resolveKatexAssetPath('/../../package.json')).toBeNull()
  })

  it('returns the expected KaTeX asset content types', () => {
    expect(getKatexAssetContentType(`${KATEX_DIST_DIR}/katex.min.css`)).toBe('text/css; charset=utf-8')
    expect(getKatexAssetContentType(`${KATEX_DIST_DIR}/fonts/KaTeX_Main-Regular.woff2`)).toBe('font/woff2')
    expect(getKatexAssetContentType(`${KATEX_DIST_DIR}/fonts/KaTeX_Main-Regular.woff`)).toBe('font/woff')
    expect(getKatexAssetContentType(`${KATEX_DIST_DIR}/fonts/KaTeX_Main-Regular.ttf`)).toBe('font/ttf')
  })
})
