import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { defineConfig, loadEnv } from 'vite'
import { resolveAppVersion } from './build/version.ts'

function getFrontendHost(frontendUrl?: string) {
  if (!frontendUrl) return []
  const withoutProto = frontendUrl.replace(/^https?:\/\//, '')
  return [withoutProto.split(/[:/]/)[0]]
}

const DEFAULT_RELEASE_REPO = 'securo-finance/securo'
const releaseRepoPattern = /^[A-Za-z0-9-]+\/[A-Za-z0-9._-]+$/

// GitHub repo whose releases the update check compares against, so forks
// that publish their own images point their users at their own releases.
function resolveReleaseRepo(value?: string) {
  const trimmed = value?.trim()
  if (!trimmed) return DEFAULT_RELEASE_REPO
  if (!releaseRepoPattern.test(trimmed)) {
    throw new Error(`VITE_RELEASE_REPO must be "owner/name", got "${trimmed}"`)
  }
  return trimmed
}

export default defineConfig(async ({ mode }) => {
  const env = loadEnv(mode, import.meta.dirname, '')
  const frontendUrl = env.FRONTEND_URL || process.env.FRONTEND_URL
  const backendUrl = env.BACKEND_URL || process.env.BACKEND_URL
  const appVersionRoot = env.APP_VERSION_ROOT || process.env.APP_VERSION_ROOT
  const appVersion = await resolveAppVersion(
    appVersionRoot || import.meta.dirname,
    env.VITE_APP_VERSION || process.env.VITE_APP_VERSION,
  )
  const releaseRepo = resolveReleaseRepo(
    env.VITE_RELEASE_REPO || process.env.VITE_RELEASE_REPO,
  )

  return {
    define: {
      __APP_VERSION__: JSON.stringify(appVersion),
      __RELEASE_REPO__: JSON.stringify(releaseRepo),
    },
    build: {
      // Keep the existing per-chunk budget; optional locales load on demand.
      chunkSizeWarningLimit: 1000,
      // Emit hashed JS/CSS into `static/` instead of Vite's default `assets/`.
      // The default collides with our `/assets` SPA route: nginx's
      // `try_files $uri $uri/ /index.html` matches the real `dist/assets/`
      // directory before falling back to index.html, so a direct load or
      // refresh of `/assets` 301s into the build dir and renders a blank
      // page instead of booting the app (issue #295).
      assetsDir: 'static',
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname, './src'),
      },
    },
    server: {
      port: 5173,
      host: '0.0.0.0',
      allowedHosts: getFrontendHost(frontendUrl),
      proxy: {
        '/api': {
          target: backendUrl ?? 'http://localhost:8000',
          changeOrigin: true,
        },
      },
      watch: {
        usePolling: true,
      },
    },
  }
})
