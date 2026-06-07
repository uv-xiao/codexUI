export type LearningViewMode = 'view' | 'notebook' | 'lab'

export const LEARNING_VIEW_MODES: Array<{ id: LearningViewMode; label: string }> = [
  { id: 'view', label: 'View' },
  { id: 'notebook', label: 'Notebook 7' },
  { id: 'lab', label: 'JupyterLab' },
]
