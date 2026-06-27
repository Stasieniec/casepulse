// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { useStats } from '../src/hooks/queries'

// A tiny consumer component exercising one hook end-to-end.
function StatsProbe() {
  const { data, isLoading } = useStats('meridian')
  if (isLoading) return <span>loading…</span>
  return <span>score:{data?.overallScore}</span>
}

describe('query hooks (smoke)', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        new Response(JSON.stringify({ overallScore: 28, contradicted: 8 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    )
  })
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('renders a value from useStats with a mocked fetch', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    render(
      <QueryClientProvider client={qc}>
        <StatsProbe />
      </QueryClientProvider>,
    )
    await waitFor(() => expect(screen.getByText('score:28')).toBeInTheDocument())
    expect(fetch).toHaveBeenCalledWith('/api/cases/meridian/stats', expect.anything())
  })
})
