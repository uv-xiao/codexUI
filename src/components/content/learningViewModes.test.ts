import { describe, expect, it } from 'vitest'
import { LEARNING_VIEW_MODES } from './learningViewModes'

describe('learning view modes', () => {
  it('labels the static note preview as View', () => {
    expect(LEARNING_VIEW_MODES.map((mode) => mode.label)).toEqual([
      'View',
      'Notebook 7',
      'JupyterLab',
    ])
  })
})
