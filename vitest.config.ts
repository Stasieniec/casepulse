import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    // Default to node; component tests opt into jsdom via a per-file
    // `// @vitest-environment jsdom` docblock.
    environment: 'node',
    include: ['test/**/*.test.{ts,tsx}'],
    exclude: ['test/api.test.ts'],
    setupFiles: ['test/setup.ts'],
  },
  assetsInclude: ['**/*.txt'],
})
