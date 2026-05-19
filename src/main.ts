import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import 'katex/dist/katex.min.css'
import './style.css'
import { t } from './composables/useUiLanguage'
import { installFeedbackDiagnostics } from './composables/useFeedbackDiagnostics'

console.log('Welcome to codexui. github: https://github.com/friuns2/codexUI')

installFeedbackDiagnostics()

const app = createApp(App)
app.config.errorHandler = (error, _instance, info) => {
  const reporter = (window as unknown as {
    __codexReportClientError?: (tag: string, message: string, extra?: Record<string, unknown>) => void
  }).__codexReportClientError
  const message = error instanceof Error ? error.stack || error.message : String(error)
  reporter?.('vue-runtime-error', message, { info })
  console.error(error)
}
app.use(router).mount('#app')

if ('serviceWorker' in navigator && import.meta.env.PROD) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { updateViaCache: 'none' })
      .then((registration) => registration.update())
      .catch((error) => {
        console.error(t('Service worker registration failed.'), error)
      })
  })
}
