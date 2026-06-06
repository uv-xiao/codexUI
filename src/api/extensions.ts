import type { ExtensionRegistry } from '../extensions/extensionRegistry'

export async function fetchExtensionRegistry(): Promise<ExtensionRegistry> {
  const response = await fetch('/codex-api/extensions')
  const payload = await response.json().catch(() => null) as { data?: ExtensionRegistry; error?: string } | null
  if (!response.ok) {
    throw new Error(payload?.error ?? `Extension registry request failed with ${response.status}`)
  }
  return payload?.data ?? { extensions: [], errors: [] }
}
