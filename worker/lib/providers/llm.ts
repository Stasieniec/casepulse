/**
 * LlmProvider factory.
 *
 * Re-exports the LlmProvider interface from shared types and exposes a factory
 * that selects the correct provider based on environment variables.
 *
 * Supported providers:
 *  - nvidia (default when NVIDIA_API_KEY is present) — NvidiaProvider via NIM REST API.
 *  - gemini — GeminiProvider, verified working fallback.
 *
 * Selection logic:
 *  1. If LLM_PROVIDER=nvidia and NVIDIA_API_KEY present → NvidiaProvider.
 *  2. If LLM_PROVIDER=gemini and GEMINI_API_KEY present → GeminiProvider.
 *  3. If LLM_PROVIDER unset: nvidia if NVIDIA_API_KEY present, else gemini.
 */
export type { LlmProvider } from '../../../shared/types'
import { GeminiProvider } from './llm.gemini'
import { NvidiaProvider } from './llm.nvidia'
import type { LlmProvider } from '../../../shared/types'

export interface LlmEnv {
  LLM_PROVIDER?: string
  GEMINI_API_KEY?: string
  GEMINI_MODEL?: string
  GEMINI_EMBED_MODEL?: string
  NVIDIA_API_KEY?: string
  NVIDIA_MODEL?: string
  NVIDIA_EMBED_MODEL?: string
}

export function getLlmProvider(env: LlmEnv): LlmProvider {
  const explicit = (env.LLM_PROVIDER ?? '').toLowerCase()

  // Resolve effective provider: explicit wins; otherwise default to nvidia if key present.
  const effectiveProvider =
    explicit === 'nvidia' || explicit === 'gemini'
      ? explicit
      : env.NVIDIA_API_KEY
        ? 'nvidia'
        : 'gemini'

  if (effectiveProvider === 'nvidia') {
    if (!env.NVIDIA_API_KEY) {
      throw new Error('NVIDIA_API_KEY is required but not set in environment.')
    }
    return new NvidiaProvider({
      apiKey: env.NVIDIA_API_KEY,
      model: env.NVIDIA_MODEL ?? 'nvidia/nemotron-3-super-120b-a12b',
      embedModel: env.NVIDIA_EMBED_MODEL ?? 'nvidia/nv-embedqa-e5-v5',
    })
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
