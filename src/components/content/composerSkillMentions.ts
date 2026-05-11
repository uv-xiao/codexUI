export type ComposerSkillMentionItem = {
  name: string
  displayName?: string
  description: string
  path: string
  scope?: string
  enabled?: boolean
}

const SKILL_MENTION_BOUNDARY_CHARS = new Set([
  '(', '[', '{', '<',
  '"', "'",
  '，', '。', '；', '：', '！', '？', '、',
  '「', '『', '《',
])

const UNQUOTED_SKILL_MENTION_STOP_CHARS = new Set([
  ')', ']', '}', '>',
  '"', "'", '`',
  '，', '。', '；', '：', '！', '？', '、',
  ',', ';', '!', '?',
])

function normalizeSkillMentionName(value: string): string {
  return value.trim().replace(/^\$+/u, '')
}

function stripTrailingSkillMentionPunctuation(value: string): string {
  let next = value.trim()
  while (/[.,;:!?，。；：！？、]$/u.test(next)) {
    next = next.slice(0, -1).trimEnd()
  }
  return next
}

function quoteSkillMentionNameIfNeeded(value: string): string {
  if (!/[\s"'`()\[\]{}<>$，。；：！？、]/u.test(value)) return value
  if (!value.includes('"')) return `"${value}"`
  if (!value.includes('`')) return `\`${value}\``
  return value
}

function hasSkillMentionBoundary(text: string, dollarIndex: number): boolean {
  if (dollarIndex <= 0) return true
  const previous = text[dollarIndex - 1]
  return /\s/u.test(previous) || SKILL_MENTION_BOUNDARY_CHARS.has(previous)
}

function readQuotedSkillMentionName(
  text: string,
  startIndex: number,
  quote: '"' | "'" | '`',
): { name: string; endIndex: number } | null {
  let index = startIndex + 1
  while (index < text.length) {
    const char = text[index]
    if (char === '\n' || char === '\r') return null
    if (char === quote) {
      const name = text.slice(startIndex + 1, index).trim()
      return name ? { name, endIndex: index + 1 } : null
    }
    index += 1
  }
  return null
}

function readUnquotedSkillMentionName(text: string, startIndex: number): { name: string; endIndex: number } | null {
  let index = startIndex
  while (index < text.length) {
    const char = text[index]
    if (/\s/u.test(char) || char === '$' || UNQUOTED_SKILL_MENTION_STOP_CHARS.has(char)) break
    index += 1
  }

  const name = stripTrailingSkillMentionPunctuation(text.slice(startIndex, index))
  return name ? { name, endIndex: index } : null
}

function readSkillMentionNameAt(text: string, dollarIndex: number): { name: string; endIndex: number } | null {
  if (text[dollarIndex] !== '$' || !hasSkillMentionBoundary(text, dollarIndex)) return null
  const startIndex = dollarIndex + 1
  const marker = text[startIndex]
  if (!marker || /\s/u.test(marker) || marker === '$') return null
  if (marker === '"' || marker === "'" || marker === '`') {
    return readQuotedSkillMentionName(text, startIndex, marker)
  }
  return readUnquotedSkillMentionName(text, startIndex)
}

function normalizeSkillLookupKey(value: string): string {
  return normalizeSkillMentionName(stripTrailingSkillMentionPunctuation(value)).toLowerCase()
}

function getSkillLabel(skill: ComposerSkillMentionItem): string {
  return (skill.displayName || skill.name).trim()
}

function getSkillAliases(skill: ComposerSkillMentionItem): string[] {
  return [skill.name, skill.displayName ?? '']
    .map((value) => value.trim())
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)
}

export function toComposerSkillMentionSearchQuery(query: string): string {
  return normalizeSkillMentionName(query)
}

export function formatComposerSkillMention(skillName: string): string {
  const normalizedName = normalizeSkillMentionName(skillName)
  return normalizedName ? `$${quoteSkillMentionNameIfNeeded(normalizedName)}` : ''
}

export function insertComposerSkillMentionText(
  draft: string,
  skillName: string,
  startIndex: number | null,
  cursorIndex = draft.length,
): { text: string; selectionIndex: number } | null {
  const mentionText = formatComposerSkillMention(skillName)
  if (!mentionText) return null

  if (startIndex !== null) {
    const start = Math.max(0, Math.min(startIndex, draft.length))
    const cursor = Math.max(start, Math.min(cursorIndex, draft.length))
    const after = draft.slice(cursor)
    const leadingWhitespaceLength = after.match(/^\s+/u)?.[0].length ?? 0
    const separator = leadingWhitespaceLength > 0 ? '' : ' '
    const text = `${draft.slice(0, start)}${mentionText}${separator}${after}`
    const selectionIndex = start + mentionText.length + separator.length + leadingWhitespaceLength
    return { text, selectionIndex }
  }

  const prefix = draft.length > 0 && !/\s$/u.test(draft) ? ' ' : ''
  const text = `${draft}${prefix}${mentionText} `
  return { text, selectionIndex: text.length }
}

export function filterComposerSkillMentionSuggestions(
  skills: ComposerSkillMentionItem[],
  query: string,
  limit = 20,
): ComposerSkillMentionItem[] {
  const normalizedQuery = toComposerSkillMentionSearchQuery(query).toLowerCase()
  const scored: Array<{ skill: ComposerSkillMentionItem; score: number; label: string }> = []

  for (const skill of skills) {
    if (!skill.path.trim()) continue
    const label = getSkillLabel(skill)
    if (!label) continue

    let score = 0
    if (normalizedQuery) {
      score = Number.POSITIVE_INFINITY
      for (const alias of getSkillAliases(skill)) {
        const key = alias.toLowerCase()
        if (key === normalizedQuery) score = Math.min(score, 0)
        else if (key.startsWith(normalizedQuery)) score = Math.min(score, 1)
        else if (key.includes(normalizedQuery)) score = Math.min(score, 2)
      }
      if (skill.description?.toLowerCase().includes(normalizedQuery)) {
        score = Math.min(score, 3)
      }
      if (skill.path.toLowerCase().includes(normalizedQuery)) {
        score = Math.min(score, 4)
      }
      if (!Number.isFinite(score)) continue
    }

    scored.push({ skill, score, label: label.toLowerCase() })
  }

  return scored
    .sort((first, second) => first.score - second.score || first.label.localeCompare(second.label))
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.skill)
}

export function extractComposerSkillMentionSelections(
  text: string,
  skills: ComposerSkillMentionItem[],
): ComposerSkillMentionItem[] {
  const skillsByName = new Map<string, ComposerSkillMentionItem>()
  for (const skill of skills) {
    if (!skill.path.trim()) continue
    for (const alias of getSkillAliases(skill)) {
      const key = normalizeSkillLookupKey(alias)
      if (key && !skillsByName.has(key)) {
        skillsByName.set(key, skill)
      }
    }
  }

  const selections: ComposerSkillMentionItem[] = []
  const seenPaths = new Set<string>()
  let index = 0

  while (index < text.length) {
    const dollarIndex = text.indexOf('$', index)
    if (dollarIndex < 0) break

    const mention = readSkillMentionNameAt(text, dollarIndex)
    if (!mention) {
      index = dollarIndex + 1
      continue
    }

    const skill = skillsByName.get(normalizeSkillLookupKey(mention.name))
    if (skill && !seenPaths.has(skill.path)) {
      seenPaths.add(skill.path)
      selections.push(skill)
    }
    index = Math.max(mention.endIndex, dollarIndex + 1)
  }

  return selections
}
