/**
 * LlmProvider factory.
 *
 * Re-exports the LlmProvider interface from shared types and exposes a factory
 * that selects the correct provider based on environment variables.
 *
 * Currently supported:
 *  - gemini (default) — GeminiProvider, verified working.
 *  - nvidia — NvidiaProvider stub (not yet implemented, throws clearly).
 */
export type { LlmProvider } from '../../../shared/types'
import { GeminiProvider } from './llm.gemini'
import type { LlmProvider } from '../../../shared/types'

export interface LlmEnv {
  LLM_PROVIDER?: string
  GEMINI_API_KEY?: string
  GEMINI_MODEL?: string
  GEMINI_EMBED_MODEL?: string
  NVIDIA_API_KEY?: string
}

export function getLlmProvider(env: LlmEnv): LlmProvider {
  const provider = (env.LLM_PROVIDER ?? 'gemini').toLowerCase()

  if (provider === 'nvidia' && env.NVIDIA_API_KEY) {
    // TODO: NvidiaProvider — NIM REST API (not yet implemented)
    throw new Error(
      'NvidiaProvider is not yet implemented. ' +
        'Set LLM_PROVIDER=gemini or leave unset to use GeminiProvider.',
    )
  }

  // Default: Gemini
  const apiKey = env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is required but not set in environment.')
  }

  return new GeminiProvider({
    apiKey,
    model: env.GEMINI_MODEL ?? 'gemini-3.5-flash',
    embedModel: env.GEMINI_EMBED_MODEL ?? 'gemini-embedding-001',
  })
}
