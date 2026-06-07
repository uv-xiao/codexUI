export type LearningNoteSummary = {
  slug: string
  title: string
  type: 'markdown' | 'notebook'
  path: string
}

export type LearningSeriesSummary = {
  id: string
  title: string
  count: number
  notes: LearningNoteSummary[]
}

export type LearningNotePayload = LearningNoteSummary & {
  seriesId: string
  markdown: string
  sourcePath: string
  jupyterPath: string
}

export type LearningJupyterOpenUrl = {
  url: string
  ui: 'lab' | 'notebook'
  port: number
}

async function readData<T>(response: Response, fallbackMessage: string): Promise<T> {
  const payload = await response.json().catch(() => null) as { data?: T; error?: string } | null
  if (!response.ok) {
    throw new Error(payload?.error ?? fallbackMessage)
  }
  if (payload?.data === undefined) {
    throw new Error(fallbackMessage)
  }
  return payload.data
}

export async function fetchLearningSeries(sourceId: string): Promise<LearningSeriesSummary[]> {
  const response = await fetch(`/codex-api/learning/${encodeURIComponent(sourceId)}/series`)
  return readData(response, 'Learning series request failed.')
}

export async function fetchLearningNote(sourceId: string, slug: string): Promise<LearningNotePayload> {
  const response = await fetch(`/codex-api/learning/${encodeURIComponent(sourceId)}/notes/${slug.split('/').map(encodeURIComponent).join('/')}`)
  return readData(response, 'Learning note request failed.')
}

export async function fetchLearningJupyterOpenUrl(
  sourceId: string,
  path: string,
  ui: 'lab' | 'notebook',
): Promise<LearningJupyterOpenUrl> {
  const params = new URLSearchParams({ path, ui })
  const response = await fetch(`/codex-api/learning/${encodeURIComponent(sourceId)}/jupyter/open-url?${params.toString()}`)
  return readData(response, 'Jupyter open URL request failed.')
}
