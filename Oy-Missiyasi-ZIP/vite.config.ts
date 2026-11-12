import { manusGameTuning } from './scripts/manus-tuning/vite.mjs'
import { loadEnv } from 'vite'
import type { ViteDevServer } from 'vite'
import { defineConfig } from 'vitest/config'

function managedStoragePreview() {
  return {
    name: 'oymissiya-managed-storage-preview',
    apply: 'serve' as const,
    async configureServer(server: ViteDevServer) {
      const runtime = (globalThis as typeof globalThis & { process?: { env?: Record<string, string | undefined> } }).process?.env?.GAME_RUNTIME
      if (!runtime) return
      const { handleStorageProxy } = await import(`${runtime}/scripts/platform-preview.mjs`)
      server.middlewares.use((req, res, next) => {
        const pathname = new URL((req as { url?: string }).url ?? '/', 'http://localhost').pathname
        if (!pathname.startsWith('/manus-storage/')) return next()
        void handleStorageProxy(req, res, pathname).catch((error: unknown) => next(error instanceof Error ? error : new Error(String(error))))
      })
    },
  }
}

// Relative base keeps production output portable; PORT/HOST can override local dev defaults.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', ['HOST', 'PORT'])
  const port = Number(env.PORT ?? 3000)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid PORT')
  return {
    base: './',
    plugins: [manusGameTuning(), managedStoragePreview()],
    server: {
      host: env.HOST ?? '127.0.0.1', port, strictPort: false,
      watch: { ignored: ['**/standalone/**'] },
      allowedHosts: ['.manuspre.computer', '.manus.computer', '.manus-asia.computer', '.manuscomputer.ai', '.manusvm.computer', 'localhost', '127.0.0.1'],
    },
    build: { target: 'es2022', assetsInlineLimit: 0, chunkSizeWarningLimit: 4600, sourcemap: false },
    test: { environment: 'node', include: ['tests/**/*.test.{ts,mjs}'] },
  }
})
