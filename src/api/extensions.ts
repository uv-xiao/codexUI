import type { ExtensionRegistry } from '../extensions/extensionRegistry'

export type ExtensionSidebarNode = {
  id: string
  label: string
  kind: string
  subtitle?: string
  count?: number
  selection?: Record<string, unknown>
  children?: ExtensionSidebarNode[]
}

export async function fetchExtensionRegistry(): Promise<ExtensionRegistry> {
  const response = await fetch('/codex-api/extensions')
  const payload = await response.json().catch(() => null) as { data?: ExtensionRegistry; error?: string } | null
  if (!response.ok) {
    throw new Error(payload?.error ?? `Extension registry request failed with ${response.status}`)
  }
  return payload?.data ?? { extensions: [], errors: [] }
}

export async function fetchExtensionSidebarNodes(url: string): Promise<ExtensionSidebarNode[]> {
  const response = await fetch(url)
  const payload = await response.json().catch(() => null) as { data?: ExtensionSidebarNode[]; error?: string } | ExtensionSidebarNode[] | null
  if (!response.ok) {
    throw new Error(!Array.isArray(payload) ? payload?.error ?? `Extension sidebar request failed with ${response.status}` : `Extension sidebar request failed with ${response.status}`)
  }
  if (Array.isArray(payload)) return payload
  return payload?.data ?? []
}
