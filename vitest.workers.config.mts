import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-pool-workers'
import { defineConfig } from 'vitest/config'
import path from 'node:path'

const migrations = await readD1Migrations(
  path.join(import.meta.dirname, 'migrations'),
)

export default defineConfig({
  plugins: [
    cloudflareTest({
      wrangler: { configPath: './wrangler.jsonc' },
      miniflare: {
        bindings: { TEST_MIGRATIONS: migrations },
      },
    }),
  ],
  test: {
    include: ['test/api.test.ts'],
    setupFiles: ['./test/workers-apply-migrations.ts'],
  },
})
