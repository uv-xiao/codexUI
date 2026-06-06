import { describe, expect, it } from 'vitest'
import { buildExtensionRegistry } from './extensionRegistry'

const validManifest = {
  id: 'notes',
  name: 'Notes',
  version: '0.1.0',
  routes: [{ id: 'home', label: 'Learning', url: '/codexui-extension/' }],
  sidebar: [{ label: 'Learning', routeId: 'home', subtitle: 'Courses and notebooks' }],
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
      { label: 'Learning', routeId: 'home', subtitle: 'Courses and notebooks' },
    ])
    expect(registry.extensions[0]?.routes).toEqual([
      { id: 'home', label: 'Learning', url: 'http://127.0.0.1:5173/codexui-extension/' },
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
