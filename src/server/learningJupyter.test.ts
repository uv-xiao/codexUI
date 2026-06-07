import { describe, expect, it, vi } from 'vitest'
import httpProxy from 'http-proxy'

vi.mock('http-proxy', () => ({
  default: {
    createProxyServer: vi.fn(() => ({
      on: vi.fn(),
      web: vi.fn(),
      ws: vi.fn(),
    })),
  },
}))

describe('learning Jupyter proxy', () => {
  it('rewrites the host header to the local Jupyter target', async () => {
    vi.resetModules()
    await import('./learningJupyter')

    expect(httpProxy.createProxyServer).toHaveBeenCalledWith(expect.objectContaining({
      changeOrigin: true,
      ws: true,
    }))
  })
})
