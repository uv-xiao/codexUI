import { describe, expect, it } from 'vitest'
import {
  extractComposerSkillMentionSelections,
  filterComposerSkillMentionSuggestions,
  formatComposerSkillMention,
  insertComposerSkillMentionText,
  toComposerSkillMentionSearchQuery,
} from './composerSkillMentions'

const skills = [
  { name: 'openai-docs', displayName: 'OpenAI Docs', description: 'Official docs helper', path: '/skills/openai-docs/SKILL.md' },
  { name: 'browser-use', displayName: 'Browser Use', description: 'Browser automation helper', path: '/skills/browser-use/SKILL.md' },
  { name: 'deep-research', displayName: 'Deep Research', description: 'Long-form research workflow', path: '/skills/deep-research/SKILL.md' },
]

describe('composerSkillMentions', () => {
  it('formats plain skill names as inline $ mentions', () => {
    expect(formatComposerSkillMention('openai-docs')).toBe('$openai-docs')
  })

  it('quotes skill names with spaces so the mention remains parseable', () => {
    expect(formatComposerSkillMention('Agent Planner')).toBe('$"Agent Planner"')
  })

  it('inserts a trailing space after inline skill mentions', () => {
    expect(insertComposerSkillMentionText('', 'openai-docs', 0)).toEqual({
      text: '$openai-docs ',
      selectionIndex: 13,
    })
  })

  it('keeps the cursor after existing whitespace when replacing a mention', () => {
    expect(insertComposerSkillMentionText('Try $open now', 'openai-docs', 4, 9)).toEqual({
      text: 'Try $openai-docs now',
      selectionIndex: 17,
    })
  })

  it('normalizes leading $ from search text', () => {
    expect(toComposerSkillMentionSearchQuery('$open')).toBe('open')
    expect(toComposerSkillMentionSearchQuery('open')).toBe('open')
  })

  it('filters skill suggestions by name, label, description, and path', () => {
    expect(filterComposerSkillMentionSuggestions(skills, 'browser').map((item) => item.name)).toEqual(['browser-use'])
    expect(filterComposerSkillMentionSuggestions(skills, 'docs').map((item) => item.name)).toEqual(['openai-docs'])
  })

  it('extracts inline $ mentions as skill selections', () => {
    const selections = extractComposerSkillMentionSelections(
      'Run $openai-docs and $"Browser Use", then ignore $HOME.',
      skills,
    )

    expect(selections.map((skill) => skill.name)).toEqual(['openai-docs', 'browser-use'])
  })
})
