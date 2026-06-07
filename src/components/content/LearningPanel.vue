<template>
  <section class="learning-panel">
    <div class="learning-toolbar">
      <div class="learning-toolbar-title">
        <h2>{{ title }}</h2>
        <p>{{ subtitle }}</p>
      </div>
      <div v-if="selectedNote" class="learning-toolbar-actions">
        <button
          v-for="mode in LEARNING_VIEW_MODES"
          :key="mode.id"
          class="learning-action"
          :class="{ 'is-active': activeViewMode === mode.id }"
          type="button"
          @click="selectViewMode(mode.id)"
        >
          {{ mode.label }}
        </button>
      </div>
    </div>

    <div v-if="error" class="learning-state learning-error">{{ error }}</div>
    <div v-else-if="isLoading" class="learning-state">Loading learning content...</div>
    <iframe
      v-else-if="jupyterUrl"
      class="learning-jupyter-frame"
      :src="jupyterUrl"
      title="Jupyter notebook"
    />
    <article
      v-else-if="selectedNote"
      class="learning-note message-markdown-body"
      v-html="renderedMarkdown"
    />
    <div v-else class="learning-series-grid">
      <button
        v-for="series in seriesList"
        :key="series.id"
        class="learning-series-card"
        type="button"
        @click="selectSeries(series.id)"
      >
        <span class="learning-series-title">{{ series.title }}</span>
        <span class="learning-series-count">{{ series.count }} notes</span>
      </button>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  fetchLearningJupyterOpenUrl,
  fetchLearningNote,
  fetchLearningSeries,
  type LearningNotePayload,
  type LearningSeriesSummary,
} from '../../api/learning'
import { renderMarkdownContent } from './markdownRenderer'
import { LEARNING_VIEW_MODES, type LearningViewMode } from './learningViewModes'

const props = defineProps<{
  extensionId: string
  title: string
}>()

const seriesList = ref<LearningSeriesSummary[]>([])
const selectedSeriesId = ref('')
const selectedNoteSlug = ref('')
const selectedNote = ref<LearningNotePayload | null>(null)
const isLoading = ref(false)
const error = ref('')
const jupyterUrl = ref('')
const activeViewMode = ref<LearningViewMode>('view')

const subtitle = computed(() => {
  if (selectedNote.value) return selectedNote.value.path
  if (selectedSeriesId.value) return selectedSeriesId.value
  return 'Courses and notebooks'
})

const renderedMarkdown = computed(() => (
  selectedNote.value
    ? renderMarkdownContent(selectedNote.value.markdown, {
      cwd: selectedNote.value.sourcePath,
      kind: 'message',
      highlightVersion: 0,
    }).html
    : ''
))

function readStoredSelection(): Record<string, unknown> | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(`codexui.extension.${props.extensionId}.selection`)
    const parsed = raw ? JSON.parse(raw) as unknown : null
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? parsed as Record<string, unknown>
      : null
  } catch {
    return null
  }
}

function applySelection(selection: Record<string, unknown> | null): void {
  jupyterUrl.value = ''
  activeViewMode.value = 'view'
  const kind = typeof selection?.kind === 'string' ? selection.kind : ''
  if (kind === 'note' && typeof selection?.slug === 'string') {
    selectedSeriesId.value = typeof selection.seriesId === 'string' ? selection.seriesId : ''
    selectedNoteSlug.value = selection.slug
    void loadNote(selection.slug)
    return
  }
  if (kind === 'series' && typeof selection?.seriesId === 'string') {
    selectedSeriesId.value = selection.seriesId
    selectedNoteSlug.value = ''
    selectedNote.value = null
  }
}

function onSelectionEvent(event: Event): void {
  const detail = (event as CustomEvent).detail as unknown
  if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return
  const record = detail as Record<string, unknown>
  if (record.extensionId !== props.extensionId) return
  const selection = record.selection && typeof record.selection === 'object' && !Array.isArray(record.selection)
    ? record.selection as Record<string, unknown>
    : null
  applySelection(selection)
}

async function loadSeries(): Promise<void> {
  isLoading.value = true
  error.value = ''
  try {
    seriesList.value = await fetchLearningSeries(props.extensionId)
    applySelection(readStoredSelection())
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Failed to load learning content.'
  } finally {
    isLoading.value = false
  }
}

async function loadNote(slug: string): Promise<void> {
  isLoading.value = true
  error.value = ''
  try {
    selectedNote.value = await fetchLearningNote(props.extensionId, slug)
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Failed to load note.'
  } finally {
    isLoading.value = false
  }
}

function selectSeries(seriesId: string): void {
  selectedSeriesId.value = seriesId
  selectedNoteSlug.value = ''
  selectedNote.value = null
  jupyterUrl.value = ''
  activeViewMode.value = 'view'
}

function showStaticView(): void {
  jupyterUrl.value = ''
  activeViewMode.value = 'view'
}

function selectViewMode(mode: LearningViewMode): void {
  if (mode === 'view') {
    showStaticView()
    return
  }
  void openJupyter(mode)
}

async function openJupyter(ui: 'lab' | 'notebook'): Promise<void> {
  if (!selectedNote.value) return
  isLoading.value = true
  error.value = ''
  try {
    const result = await fetchLearningJupyterOpenUrl(props.extensionId, selectedNote.value.jupyterPath, ui)
    jupyterUrl.value = result.url
    activeViewMode.value = ui
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Failed to open Jupyter.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  window.addEventListener('codexui-extension-selection', onSelectionEvent)
  void loadSeries()
})

onBeforeUnmount(() => {
  window.removeEventListener('codexui-extension-selection', onSelectionEvent)
})

watch(() => props.extensionId, () => {
  selectedSeriesId.value = ''
  selectedNoteSlug.value = ''
  selectedNote.value = null
  jupyterUrl.value = ''
  activeViewMode.value = 'view'
  void loadSeries()
})
</script>

<style scoped>
.learning-panel {
  display: flex;
  min-height: 0;
  height: 100%;
  width: 100%;
  flex-direction: column;
  background: var(--color-background, #fff);
}

.learning-toolbar {
  display: flex;
  min-height: 72px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgb(228 228 231);
  padding: 14px 24px;
}

.learning-toolbar-title {
  min-width: 0;
}

.learning-toolbar-title h2 {
  margin: 0;
  color: rgb(24 24 27);
  font-size: 18px;
  font-weight: 700;
  line-height: 24px;
}

.learning-toolbar-title p {
  margin: 2px 0 0;
  color: rgb(113 113 122);
  font-size: 12px;
  line-height: 18px;
}

.learning-toolbar-actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}

.learning-action {
  min-height: 34px;
  border-radius: 8px;
  border: 1px solid rgb(212 212 216);
  background: rgb(255 255 255);
  padding: 0 12px;
  color: rgb(39 39 42);
  font-size: 13px;
  font-weight: 600;
}

.learning-action.is-active {
  border-color: rgb(2 132 199);
  background: rgb(2 132 199);
  color: white;
}

.learning-state {
  margin: auto;
  color: rgb(82 82 91);
  font-size: 14px;
}

.learning-error {
  color: rgb(185 28 28);
}

.learning-note {
  min-height: 0;
  overflow: auto;
  padding: 28px min(6vw, 56px);
}

.learning-jupyter-frame {
  min-height: 0;
  flex: 1;
  border: 0;
  background: white;
}

.learning-series-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
  padding: 24px;
}

.learning-series-card {
  display: flex;
  min-height: 86px;
  flex-direction: column;
  align-items: flex-start;
  justify-content: center;
  gap: 6px;
  border-radius: 8px;
  border: 1px solid rgb(228 228 231);
  background: rgb(250 250 250);
  padding: 16px;
  text-align: left;
}

.learning-series-title {
  color: rgb(24 24 27);
  font-size: 15px;
  font-weight: 700;
}

.learning-series-count {
  color: rgb(113 113 122);
  font-size: 12px;
  font-weight: 600;
}

:global(:root.dark) .learning-panel {
  background: rgb(9 9 11);
}

:global(:root.dark) .learning-toolbar {
  border-bottom-color: rgb(39 39 42);
}

:global(:root.dark) .learning-toolbar-title h2,
:global(:root.dark) .learning-series-title {
  color: rgb(244 244 245);
}

:global(:root.dark) .learning-toolbar-title p,
:global(:root.dark) .learning-series-count,
:global(:root.dark) .learning-state {
  color: rgb(161 161 170);
}

:global(:root.dark) .learning-action {
  border-color: rgb(63 63 70);
  background: rgb(24 24 27);
  color: rgb(244 244 245);
}

:global(:root.dark) .learning-action.is-active {
  border-color: rgb(14 165 233);
  background: rgb(14 165 233);
  color: rgb(8 47 73);
}

:global(:root.dark) .learning-series-card {
  border-color: rgb(39 39 42);
  background: rgb(24 24 27);
}
</style>
