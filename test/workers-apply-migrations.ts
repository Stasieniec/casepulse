import { env, applyD1Migrations } from 'cloudflare:test'
import { beforeAll } from 'vitest'

// Apply D1 migrations to the local test database before all tests run.
beforeAll(async () => {
  await applyD1Migrations(env.DB, (env as any).TEST_MIGRATIONS)
})
