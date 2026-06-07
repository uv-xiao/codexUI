<template>
  <section class="extension-route-host">
    <div v-if="isLoading" class="extension-route-state">Loading extension...</div>
    <div v-else-if="error" class="extension-route-state extension-route-error">{{ error }}</div>
    <LearningPanel
      v-else-if="selectedRoute?.kind === 'learning' && selectedExtension"
      :extension-id="selectedExtension.id"
      :title="selectedRoute.label"
    />
    <template v-else-if="routeUrl">
      <iframe
        class="extension-route-frame"
        :src="routeUrl"
        :title="routeTitle"
      />
    </template>
    <div v-else class="extension-route-state">Extension route not found.</div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { fetchExtensionRegistry } from '../../api/extensions'
import type { RegisteredExtension } from '../../extensions/extensionRegistry'
import LearningPanel from './LearningPanel.vue'

const route = useRoute()
const isLoading = ref(false)
const error = ref('')
const extensions = ref<RegisteredExtension[]>([])

const extensionId = computed(() => {
  const raw = route.params.extensionId
  return typeof raw === 'string' ? raw : ''
})

const routeId = computed(() => {
  const raw = route.params.routeId
  return typeof raw === 'string' && raw.trim().length > 0 ? raw : 'home'
})

const selectedExtension = computed(() => (
  extensions.value.find((extension) => extension.id === extensionId.value) ?? null
))

const selectedRoute = computed(() => (
  selectedExtension.value?.routes.find((candidate) => candidate.id === routeId.value) ?? null
))

const routeUrl = computed(() => selectedRoute.value?.url ?? '')
const routeTitle = computed(() => selectedRoute.value?.label ?? selectedExtension.value?.name ?? 'Extension')

async function loadExtensions(): Promise<void> {
  isLoading.value = true
  error.value = ''
  try {
    const registry = await fetchExtensionRegistry()
    extensions.value = registry.extensions
    const matchingError = registry.errors.find((item) => item.id === extensionId.value)
    if (matchingError) {
      error.value = matchingError.message
    }
  } catch (loadError) {
    error.value = loadError instanceof Error ? loadError.message : 'Failed to load extension.'
  } finally {
    isLoading.value = false
  }
}

onMounted(() => {
  void loadExtensions()
})

watch(
  () => [extensionId.value, routeId.value] as const,
  () => {
    void loadExtensions()
  },
)
</script>

<style scoped>
.extension-route-host {
  display: flex;
  min-height: 0;
  height: 100%;
  width: 100%;
}

.extension-route-frame {
  width: 100%;
  min-height: 0;
  border: 0;
  background: var(--color-background, #fff);
}

.extension-route-state {
  margin: auto;
  max-width: 520px;
  color: #475569;
  font-size: 0.95rem;
}

.extension-route-error {
  color: #b91c1c;
}
</style>
