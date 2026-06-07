import { describe, expect, it } from 'vitest'
import { buildExtensionRegistry } from './extensionRegistry'

const validManifest = {
  id: 'notes',
  name: 'Notes',
  version: '0.1.0',
  routes: [{ id: 'home', label: 'Learning', url: '/codexui-extension/' }],
  sidebar: [{ label: 'Learning', routeId: 'home', subtitle: 'Courses and notebooks', itemsUrl: '/api/codexui/sidebar' }],
}

describe('extension registry', () => {
  it('registers enabled extension sidebar and route entries', () => {
    const registry = buildExtensionRegistry({
      extensions: [
        {
          id: 'notes',
          settings: { runtimeBaseUrl: 'http://127.0.0.1:5173' },
          manifest: validManifest,
        },
      ],
    })

    expect(registry.errors).toEqual([])
    expect(registry.extensions).toHaveLength(1)
    expect(registry.extensions[0]?.sidebar).toEqual([
      {
        label: 'Learning',
        routeId: 'home',
        subtitle: 'Courses and notebooks',
        itemsUrl: 'http://127.0.0.1:5173/api/codexui/sidebar',
      },
    ])
    expect(registry.extensions[0]?.routes).toEqual([
      { id: 'home', label: 'Learning', kind: 'iframe', url: 'http://127.0.0.1:5173/codexui-extension/' },
    ])
  })

  it('registers native learning routes without iframe URLs', () => {
    const registry = buildExtensionRegistry({
      extensions: [
        {
          id: 'notes',
          settings: { learningConfig: '/tmp/notes/codexui.learning.toml' },
          manifest: {
            id: 'notes',
            name: 'Notes',
            routes: [{ id: 'home', label: 'Learning', kind: 'learning' }],
            sidebar: [{ label: 'Learning', routeId: 'home', itemsUrl: '/codex-api/learning/notes/sidebar' }],
          },
        },
      ],
    })

    expect(registry.errors).toEqual([])
    expect(registry.extensions[0]?.routes).toEqual([
      { id: 'home', label: 'Learning', kind: 'learning', url: '' },
    ])
  })

  it('rejects invalid manifests without blocking other extensions', () => {
    const registry = buildExtensionRegistry({
      extensions: [
        { id: 'broken', manifest: { id: 'broken', name: 'Broken', routes: [], sidebar: [] } },
        { id: 'notes', manifest: validManifest },
      ],
    })

    expect(registry.extensions.map((extension) => extension.id)).toEqual(['notes'])
    expect(registry.errors).toEqual([
      { id: 'broken', message: 'Expected manifest.routes to contain at least one route.' },
    ])
  })

  it('ignores disabled extensions', () => {
    const registry = buildExtensionRegistry({
      extensions: [{ id: 'notes', enabled: false, manifest: validManifest }],
    })

    expect(registry.extensions).toEqual([])
    expect(registry.errors).toEqual([])
  })

  it('rejects sidebar entries that point at missing routes', () => {
    const registry = buildExtensionRegistry({
      extensions: [
        {
          id: 'notes',
          manifest: {
            ...validManifest,
            sidebar: [{ label: 'Learning', routeId: 'missing' }],
          },
        },
      ],
    })

    expect(registry.extensions).toEqual([])
    expect(registry.errors).toEqual([
      { id: 'notes', message: 'Sidebar route "missing" is not declared in manifest.routes.' },
    ])
  })
})
