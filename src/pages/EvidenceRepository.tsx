/**
 * Evidence Repository — case handover view.
 *
 * A colleague taking over the case opens this page and instantly sees every
 * exhibit, when it landed (the "version control" / upload date), and what each
 * piece proves or breaks.
 *
 * Data: useGraph → {claims, evidence, edges}; useGds → centrality scores.
 * Static metadata: src/lib/docMeta.ts (real dates, faked upload/version data).
 */
import { useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import type { Edge, Claim } from '../../shared/types'
import { useGraph, useGds } from '../hooks/queries'
import { DOC_META, type DocCategory } from '../lib/docMeta'
import { relationColor } from '../lib/status'
import { Panel } from '../components/ui/Panel'
import { SectionHeader } from '../components/ui/SectionHeader'
import { StatusPill } from '../components/ui/StatusPill'
import { EvidenceViewer, type EvidenceTarget } from '../components/EvidenceViewer'
import { cn } from '../lib/cn'

// ─── Types ───────────────────────────────────────────────────────────────────

type SortKey = 'uploaded' | 'tab' | 'docDate' | 'findings' | 'pivotal'
type SortDir = 'asc' | 'desc'

interface DocRow {
  id: string
  meta: (typeof DOC_META)[string]
  edges: Edge[]
  claims: Claim[]
  centralityRank: number // 1 = most pivotal
  centralityScore: number
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatUploadDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
}

function countRelations(edges: Edge[]) {
  let supports = 0,
    contradicts = 0,
    neutral = 0
  for (const e of edges) {
    if (e.relation === 'supports') supports++
    else if (e.relation === 'contradicts') contradicts++
    else neutral++
  }
  return { supports, contradicts, neutral, total: edges.length }
}

/** Small inline split bar showing supports / contradicts / neutral ratio. */
function RelationBar({ edges, compact }: { edges: Edge[]; compact?: boolean }) {
  const { supports, contradicts, neutral, total } = countRelations(edges)
  if (total === 0) {
    return <span className="font-mono text-[11px] text-parchment-muted/50">—</span>
  }
  const height = compact ? 'h-1' : 'h-1.5'
  return (
    <div className={cn('flex w-full overflow-hidden rounded-full', height, 'bg-ink-raised')}>
      {supports > 0 && (
        <div
          className="transition-all"
          style={{ width: `${(supports / total) * 100}%`, backgroundColor: '#2FBF8F' }}
          title={`${supports} supports`}
        />
      )}
      {neutral > 0 && (
        <div
          className="transition-all"
          style={{ width: `${(neutral / total) * 100}%`, backgroundColor: '#5B6675' }}
          title={`${neutral} neutral`}
        />
      )}
      {contradicts > 0 && (
        <div
          className="transition-all"
          style={{ width: `${(contradicts / total) * 100}%`, backgroundColor: '#E5484D' }}
          title={`${contradicts} contradicts`}
        />
      )}
    </div>
  )
}

/** Version badge — gold for v1, amber-bordered for v2 to signal amendment. */
function VersionBadge({ version, supersededNote }: { version: string; supersededNote?: string }) {
  const isAmended = version !== 'v1'
  return (
    <span
      className="inline-flex shrink-0 items-center rounded-[3px] px-1.5 py-[2px] font-mono text-[10px] font-semibold"
      style={
        isAmended
          ? {
              color: '#E0A86A',
              backgroundColor: 'rgba(224,168,106,0.14)',
              boxShadow: 'inset 0 0 0 1px rgba(224,168,106,0.45)',
            }
          : {
              color: '#8A93A3',
              backgroundColor: 'rgba(138,147,163,0.10)',
              boxShadow: 'inset 0 0 0 1px rgba(138,147,163,0.22)',
            }
      }
      title={supersededNote}
    >
      {version}
    </span>
  )
}

/** Pivotal rank indicator: star filled for top-5, outline for rest. */
function PivotalStar({ rank, score }: { rank: number; score: number }) {
  const isPivotal = rank <= 5
  const color = isPivotal ? '#E0A86A' : '#1E2533'
  const textColor = isPivotal ? '#E0A86A' : '#5B6675'
  return (
    <span
      className="inline-flex items-center gap-1 font-mono text-[10px]"
      style={{ color: textColor }}
      title={`GDS centrality score: ${score.toFixed(3)} (rank #${rank})`}
    >
      <svg width="11" height="11" viewBox="0 0 16 16" fill={color} aria-hidden>
        <path d="M8 1.2 L9.8 6 H15 L10.7 9.2 L12.3 14 L8 11 L3.7 14 L5.3 9.2 L1 6 H6.2 Z" />
      </svg>
      #{rank}
    </span>
  )
}

/** Category pill — tight, low-alpha, no status color (uses slate family). */
function CategoryPill({ category }: { category: DocCategory }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded-[3px] border border-ink-line bg-ink-raised px-2 py-[2px] font-mono text-[10px] text-parchment-muted">
      {category}
    </span>
  )
}

/** Sort caret indicator. */
function SortCaret({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span
      className={cn(
        'ml-1 inline-block font-mono text-[9px] transition-opacity',
        active ? 'opacity-100' : 'opacity-0 group-hover:opacity-40',
      )}
    >
      {dir === 'asc' ? '↑' : '↓'}
    </span>
  )
}

// ─── Row detail (expanded findings) ──────────────────────────────────────────

interface RowDetailProps {
  row: DocRow
  caseId: string
  analysisId: string | undefined
  onOpenSource: (target: EvidenceTarget) => void
  onViewGraph: () => void
}

function RowDetail({ row, caseId, analysisId, onOpenSource, onViewGraph }: RowDetailProps) {
  const { meta, edges, claims } = row
  const claimById = useMemo(() => new Map(claims.map((c) => [c.id, c])), [claims])

  return (
    <div className="border-t border-ink-line bg-ink/40 px-6 pb-5 pt-4 animate-fade-in">
      {/* Version control line */}
      {meta.supersededNote && (
        <div
          className="mb-4 flex items-center gap-2.5 rounded-[3px] border border-ink-line bg-ink-raised/70 px-3 py-2"
          style={{ borderLeftColor: '#E0A86A', borderLeftWidth: 2 }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden className="shrink-0 text-gold">
            <circle cx="8" cy="5" r="2.5" stroke="#E0A86A" strokeWidth="1.4" />
            <circle cx="8" cy="12" r="2.5" stroke="#E0A86A" strokeWidth="1.4" />
            <path d="M8 7.5 V9.5" stroke="#E0A86A" strokeWidth="1.4" strokeLinecap="round" />
          </svg>
          <span className="font-mono text-[11px] text-gold/90">{meta.supersededNote}</span>
        </div>
      )}

      {/* Custody line */}
      <div className="mb-4 font-mono text-[10.5px] text-parchment-muted/70">
        Custodian: <span className="text-parchment-muted">{meta.custodian}</span>
        {' · '}
        Uploaded: <span className="text-parchment-muted">{formatUploadDate(meta.uploadedAt)}</span>
        {' · '}
        <VersionBadge version={meta.version} supersededNote={meta.supersededNote} />
      </div>

      {edges.length === 0 ? (
        <p className="font-mono text-[12px] text-parchment-muted/60">
          No extracted findings for this exhibit.
        </p>
      ) : (
        <div className="space-y-3">
          {edges.map((edge) => {
            const claim = claimById.get(edge.claimId)
            const color = relationColor(edge.relation)
            return (
              <div
                key={edge.id}
                className="rounded-[3px] border border-ink-line bg-ink-panel/60"
                style={{ borderLeftColor: color, borderLeftWidth: 3 }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3 px-3 py-2.5">
                  {/* Claim bearing + relation */}
                  <div className="flex flex-wrap items-center gap-2">
                    {claim && (
                      <span
                        className="rounded-[3px] px-1.5 py-[2px] font-mono text-[11px] font-semibold"
                        style={{ color, backgroundColor: `${color}1f` }}
                      >
                        {claim.label}
                      </span>
                    )}
                    {claim && <StatusPill status={claim.status} />}
                    <span
                      className="inline-flex items-center gap-1 font-sans text-[11px] font-semibold uppercase tracking-[0.07em]"
                      style={{ color }}
                    >
                      {edge.relation === 'supports' ? '↑ Supports' : edge.relation === 'contradicts' ? '↓ Contradicts' : '· Bears on'}
                    </span>
                    <span className="font-mono text-[10.5px] text-parchment-muted">
                      {Math.round(edge.confidence * 100)}% conf.
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() =>
                        onOpenSource({
                          docId: meta.id,
                          quote: edge.quote,
                          relation: edge.relation,
                          claimLabel: claim?.label,
                          rationale: edge.rationale,
                        })
                      }
                      className="rounded-[3px] border border-ink-line bg-ink-raised/60 px-2.5 py-1 font-sans text-[11px] text-parchment-muted transition-colors hover:border-ink-line/0 hover:bg-ink-raised hover:text-parchment-body"
                    >
                      Open source
                    </button>
                    <button
                      onClick={onViewGraph}
                      className="rounded-[3px] border border-ink-line bg-ink-raised/60 px-2.5 py-1 font-sans text-[11px] text-parchment-muted transition-colors hover:border-ink-line/0 hover:bg-ink-raised hover:text-parchment-body"
                    >
                      View in graph
                    </button>
                  </div>
                </div>

                {/* Verbatim quote */}
                <blockquote
                  className="border-t border-ink-line/60 px-3 pb-2.5 pt-2 font-mono text-[11.5px] leading-[1.75] text-parchment-body"
                  style={{ background: `${color}08` }}
                >
                  &ldquo;{edge.quote}&rdquo;
                </blockquote>

                {/* Rationale */}
                {edge.rationale && (
                  <p className="border-t border-ink-line/40 px-3 pb-2.5 pt-2 font-sans text-[11px] italic leading-relaxed text-parchment-muted">
                    {edge.rationale}
                  </p>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Main page ────────────────────────────────────────────────────────────────

interface EvidenceRepositoryProps {
  caseId: string
  analysisId?: string
}

export default function EvidenceRepository({ caseId, analysisId }: EvidenceRepositoryProps) {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { data: graph, isLoading: graphLoading } = useGraph(caseId, analysisId)
  const { data: gds, isLoading: gdsLoading } = useGds(caseId, analysisId)

  // Sort state
  const [sortKey, setSortKey] = useState<SortKey>('uploaded')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  // Filter state
  const [filterCategory, setFilterCategory] = useState<DocCategory | 'All'>('All')
  const [filterContradicts, setFilterContradicts] = useState(false)

  // Expanded rows
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // EvidenceViewer state
  const [viewerTarget, setViewerTarget] = useState<EvidenceTarget | null>(null)

  const handleSort = useCallback(
    (key: SortKey) => {
      if (key === sortKey) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortKey(key)
        setSortDir(key === 'tab' ? 'asc' : 'desc')
      }
    },
    [sortKey],
  )

  const rows = useMemo<DocRow[]>(() => {
    if (!graph || !gds) return []

    const { claims, edges } = graph

    // Build centrality ranking: sort by score desc, assign rank.
    const docIds = Object.keys(DOC_META)
    const sortedByCentrality = [...docIds].sort(
      (a, b) => (gds.centrality[b] ?? 0) - (gds.centrality[a] ?? 0),
    )
    const rankMap: Record<string, number> = {}
    sortedByCentrality.forEach((id, i) => {
      rankMap[id] = i + 1
    })

    return docIds.map((docId) => {
      const meta = DOC_META[docId]
      const docEdges = edges.filter((e) => e.documentId === docId)
      const claimIds = new Set(docEdges.map((e) => e.claimId))
      const docClaims = claims.filter((c) => claimIds.has(c.id))

      return {
        id: docId,
        meta,
        edges: docEdges,
        claims: docClaims,
        centralityRank: rankMap[docId] ?? 99,
        centralityScore: gds.centrality[docId] ?? 0,
      }
    })
  }, [graph, gds])

  const filteredRows = useMemo(() => {
    let r = rows
    if (filterCategory !== 'All') {
      r = r.filter((row) => row.meta.category === filterCategory)
    }
    if (filterContradicts) {
      r = r.filter((row) => row.edges.some((e) => e.relation === 'contradicts'))
    }
    return r
  }, [rows, filterCategory, filterContradicts])

  const sortedRows = useMemo(() => {
    const mult = sortDir === 'asc' ? 1 : -1
    return [...filteredRows].sort((a, b) => {
      switch (sortKey) {
        case 'tab':
          return mult * a.id.localeCompare(b.id)
        case 'uploaded':
          return mult * a.meta.uploadedAt.localeCompare(b.meta.uploadedAt)
        case 'docDate':
          // Sort by upload date as proxy (actual docDate is display-only string).
          return mult * a.meta.uploadedAt.localeCompare(b.meta.uploadedAt)
        case 'findings':
          return mult * (a.edges.length - b.edges.length)
        case 'pivotal':
          // Pivotal rank: 1 = best, so lower rank = more pivotal.
          return mult * (b.centralityRank - a.centralityRank)
        default:
          return 0
      }
    })
  }, [filteredRows, sortKey, sortDir])

  // Summary stats
  const summaryStats = useMemo(() => {
    const totalEdges = rows.reduce((n, r) => n + r.edges.length, 0)
    const contradictingDocs = rows.filter((r) => r.edges.some((e) => e.relation === 'contradicts'))
    const disclosureDates = rows.map((r) => r.meta.uploadedAt).sort()
    const earliest = disclosureDates[0] ? formatUploadDate(disclosureDates[0]) : '—'
    const latest = disclosureDates[disclosureDates.length - 1]
      ? formatUploadDate(disclosureDates[disclosureDates.length - 1])
      : '—'
    return { totalEdges, contradictingDocs: contradictingDocs.length, earliest, latest }
  }, [rows])

  const categories: DocCategory[] = [
    'Contract',
    'Amendment',
    'Record',
    'Correspondence',
    'Internal record',
    'Witness (fact)',
    'Witness (expert)',
  ]

  const isLoading = graphLoading || gdsLoading

  const goToGraph = useCallback(() => {
    const base = `/case/${caseId}/graph`
    navigate(analysisId ? `${base}?analysis=${encodeURIComponent(analysisId)}` : base)
  }, [caseId, analysisId, navigate])

  if (isLoading) return <RepositorySkeleton />

  // Build column header helper
  function ColHeader({
    label,
    sortable,
    field,
    className,
  }: {
    label: string
    sortable?: SortKey
    field?: SortKey
    className?: string
  }) {
    const isActive = sortable === sortKey
    return sortable ? (
      <th
        className={cn(
          'group cursor-pointer select-none px-4 py-3 text-left font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-parchment-muted/80 transition-colors hover:text-parchment-body',
          className,
        )}
        onClick={() => handleSort(sortable)}
      >
        {label}
        <SortCaret active={isActive} dir={isActive ? sortDir : 'desc'} />
      </th>
    ) : (
      <th
        className={cn(
          'px-4 py-3 text-left font-sans text-[11px] font-semibold uppercase tracking-[0.1em] text-parchment-muted/80',
          className,
        )}
      >
        {label}
      </th>
    )
  }

  return (
    <div className="px-10 py-9 lg:px-12 xl:px-16">
      {/* Page header */}
      <div className="mb-8 border-b border-ink-line pb-7">
        <div className="flex flex-wrap items-start justify-between gap-6">
          <div>
            <div className="eyebrow mb-2 text-gold/70">Handover · Evidence Bundle</div>
            <h1 className="font-serif text-[1.8rem] font-semibold leading-tight text-parchment">
              Evidence Repository
            </h1>
            <p className="mt-2 max-w-[600px] font-serif text-[14.5px] italic leading-relaxed text-parchment-muted">
              Everything a colleague taking over needs: every exhibit, when it landed, and what it
              proves or breaks.
            </p>
          </div>

          {/* Handover summary stats */}
          <div className="flex shrink-0 flex-wrap gap-4">
            <StatCard label="Exhibits" value={Object.keys(DOC_META).length.toString()} />
            <StatCard
              label="Total findings"
              value={summaryStats.totalEdges.toString()}
              sub="extracted edges"
            />
            <StatCard
              label="Contradicting"
              value={summaryStats.contradictingDocs.toString()}
              sub="exhibits"
              danger
            />
            <StatCard
              label="Disclosed"
              value={summaryStats.earliest}
              sub={`→ ${summaryStats.latest}`}
            />
          </div>
        </div>

        {/* Version-control callout */}
        <div className="mt-5 flex items-start gap-2.5 rounded-[3px] border border-ink-line bg-ink-raised/40 px-4 py-3">
          <svg
            width="13"
            height="13"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden
            className="mt-[1px] shrink-0 text-gold"
          >
            <circle cx="8" cy="4" r="2.5" stroke="#E0A86A" strokeWidth="1.3" />
            <circle cx="8" cy="12" r="2.5" stroke="#E0A86A" strokeWidth="1.3" />
            <path d="M8 6.5 V9.5" stroke="#E0A86A" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          <p className="font-mono text-[11px] leading-relaxed text-parchment-muted">
            <span className="text-gold">Version control:</span> Sorted newest-first by upload date.
            D16 (Helena Vance) is{' '}
            <span className="text-gold">v2 — amended statement</span>; the v1 is superseded.
            Standard Disclosure batch landed <span className="text-parchment-body">18 Jul 2025</span>;
            witness statements <span className="text-parchment-body">13 Mar 2026</span>; expert
            reports <span className="text-parchment-body">24 Apr 2026</span>.
          </p>
        </div>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="eyebrow mr-1">Filter</div>

        {/* Category filter */}
        <div className="flex flex-wrap gap-1.5">
          {(['All', ...categories] as const).map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCategory(cat as DocCategory | 'All')}
              className={cn(
                'rounded-[3px] border px-2.5 py-1 font-sans text-[11px] font-medium transition-colors duration-150',
                filterCategory === cat
                  ? 'border-gold/40 bg-gold/12 text-gold'
                  : 'border-ink-line bg-ink-raised/30 text-parchment-muted hover:border-ink-line/0 hover:bg-ink-raised hover:text-parchment-body',
              )}
            >
              {cat}
            </button>
          ))}
        </div>

        <div className="h-4 w-px bg-ink-line" />

        {/* Contradicts toggle */}
        <button
          onClick={() => setFilterContradicts((v) => !v)}
          className={cn(
            'flex items-center gap-2 rounded-[3px] border px-3 py-1.5 font-sans text-[11.5px] font-medium transition-colors duration-150',
            filterContradicts
              ? 'border-status-contradicted/40 bg-status-contradicted/10 text-status-contradicted'
              : 'border-ink-line bg-ink-raised/30 text-parchment-muted hover:border-ink-line/0 hover:bg-ink-raised hover:text-parchment-body',
          )}
        >
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: filterContradicts ? '#E5484D' : '#5B6675' }}
          />
          Contradicting only
        </button>

        <span className="ml-auto font-mono text-[11px] text-parchment-muted/60">
          {sortedRows.length} of {Object.keys(DOC_META).length} exhibits
        </span>
      </div>

      {/* Evidence table */}
      <Panel flush>
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-ink-line">
                <ColHeader label="Tab" sortable="tab" className="w-[70px]" />
                <ColHeader label="Document" className="min-w-[220px]" />
                <ColHeader label="Category" className="w-[140px]" />
                <ColHeader label="Doc date" className="w-[120px]" />
                <ColHeader label="Uploaded" sortable="uploaded" className="w-[150px]" />
                <ColHeader label="Findings" sortable="findings" className="w-[140px]" />
                <ColHeader label="Bears on" className="min-w-[160px]" />
                <ColHeader label="Pivotal" sortable="pivotal" className="w-[80px]" />
              </tr>
            </thead>
            <tbody>
              {sortedRows.map((row, idx) => {
                const { meta, edges, claims, centralityRank, centralityScore } = row
                const isExpanded = expandedId === row.id
                const { supports, contradicts, neutral, total } = countRelations(edges)

                return (
                  <>
                    <tr
                      key={row.id}
                      className={cn(
                        'group cursor-pointer border-b border-ink-line/60 transition-colors duration-100',
                        isExpanded ? 'bg-ink-raised/60' : 'hover:bg-ink-raised/30',
                        idx % 2 === 0 && !isExpanded && 'bg-ink/20',
                      )}
                      onClick={() => setExpandedId(isExpanded ? null : row.id)}
                      aria-expanded={isExpanded}
                    >
                      {/* Tab ID */}
                      <td className="px-4 py-3">
                        <span className="font-mono text-[12px] font-semibold text-parchment-muted">
                          {meta.id}
                        </span>
                      </td>

                      {/* Title + version */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <span className="font-sans text-[13px] font-medium text-parchment-body group-hover:text-parchment">
                            {meta.title}
                          </span>
                          <VersionBadge version={meta.version} supersededNote={meta.supersededNote} />
                        </div>
                        {meta.version !== 'v1' && (
                          <div className="mt-0.5 font-mono text-[10px] text-gold/70">
                            {meta.supersededNote}
                          </div>
                        )}
                      </td>

                      {/* Category */}
                      <td className="px-4 py-3">
                        <CategoryPill category={meta.category} />
                      </td>

                      {/* Doc date */}
                      <td className="px-4 py-3 font-mono text-[11.5px] text-parchment-muted">
                        {meta.docDate}
                      </td>

                      {/* Uploaded + version */}
                      <td className="px-4 py-3">
                        <div className="font-mono text-[11.5px] text-parchment-body">
                          {formatUploadDate(meta.uploadedAt)}
                        </div>
                        <div className="mt-0.5 font-mono text-[10px] text-parchment-muted/60">
                          {meta.custodian}
                        </div>
                      </td>

                      {/* Findings: count + split bar */}
                      <td className="px-4 py-3">
                        {total === 0 ? (
                          <span className="font-mono text-[11px] text-parchment-muted/40">
                            No findings
                          </span>
                        ) : (
                          <div className="space-y-1.5">
                            <div className="flex items-baseline gap-1.5">
                              <span className="font-mono text-[13px] font-semibold text-parchment-body">
                                {total}
                              </span>
                              <span className="font-mono text-[10px] text-parchment-muted/60">
                                {supports > 0 && (
                                  <span style={{ color: '#2FBF8F' }}>{supports}↑</span>
                                )}
                                {neutral > 0 && (
                                  <span className="ml-0.5 text-parchment-muted/60">{neutral}·</span>
                                )}
                                {contradicts > 0 && (
                                  <span className="ml-0.5" style={{ color: '#E5484D' }}>
                                    {contradicts}↓
                                  </span>
                                )}
                              </span>
                            </div>
                            <RelationBar edges={edges} compact />
                          </div>
                        )}
                      </td>

                      {/* Bears on: claim chips */}
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {claims.slice(0, 5).map((claim) => {
                            // Find the strongest relation this doc has to this claim.
                            const claimEdges = edges.filter((e) => e.claimId === claim.id)
                            const rel = claimEdges.some((e) => e.relation === 'contradicts')
                              ? 'contradicts'
                              : claimEdges.some((e) => e.relation === 'supports')
                                ? 'supports'
                                : 'neutral'
                            const color = relationColor(rel)
                            return (
                              <span
                                key={claim.id}
                                className="rounded-[3px] px-1.5 py-[2px] font-mono text-[10px] font-semibold"
                                style={{ color, backgroundColor: `${color}1f` }}
                                title={claim.headline}
                              >
                                {claim.label}
                              </span>
                            )
                          })}
                          {claims.length > 5 && (
                            <span className="rounded-[3px] border border-ink-line px-1.5 py-[2px] font-mono text-[10px] text-parchment-muted/60">
                              +{claims.length - 5}
                            </span>
                          )}
                          {claims.length === 0 && (
                            <span className="font-mono text-[10.5px] text-parchment-muted/40">—</span>
                          )}
                        </div>
                      </td>

                      {/* Pivotal */}
                      <td className="px-4 py-3">
                        <PivotalStar rank={centralityRank} score={centralityScore} />
                      </td>
                    </tr>

                    {/* Expanded detail row */}
                    {isExpanded && (
                      <tr key={`${row.id}-detail`} className="border-b border-ink-line">
                        <td colSpan={8} className="p-0">
                          <RowDetail
                            row={row}
                            caseId={caseId}
                            analysisId={analysisId}
                            onOpenSource={setViewerTarget}
                            onViewGraph={goToGraph}
                          />
                        </td>
                      </tr>
                    )}
                  </>
                )
              })}
            </tbody>
          </table>

          {sortedRows.length === 0 && (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <p className="font-serif text-[1rem] text-parchment-muted">No exhibits match this filter.</p>
              <button
                className="mt-3 font-mono text-[11px] text-gold/70 hover:text-gold underline"
                onClick={() => {
                  setFilterCategory('All')
                  setFilterContradicts(false)
                }}
              >
                Clear filters
              </button>
            </div>
          )}
        </div>
      </Panel>

      {/* Footer / methodology note */}
      <div className="mt-6 flex items-start gap-2 border-t border-ink-line pt-5">
        <svg width="11" height="11" viewBox="0 0 16 16" fill="none" aria-hidden className="mt-[1px] shrink-0">
          <circle cx="8" cy="8" r="6.5" stroke="#5B6675" strokeWidth="1.3" />
          <path d="M8 7 V11" stroke="#5B6675" strokeWidth="1.3" strokeLinecap="round" />
          <circle cx="8" cy="5.5" r="0.9" fill="#5B6675" />
        </svg>
        <p className="font-mono text-[10px] leading-relaxed text-parchment-muted/60">
          Findings extracted by LLM-judge (confidence threshold 0.55). Pivotal rank derived from GDS
          betweenness centrality on the claim–evidence graph. Upload dates reflect Standard Disclosure
          (18 Jul 2025), witness exchange (13 Mar 2026), and expert service (24 Apr 2026) batches.
        </p>
      </div>

      {/* EvidenceViewer drawer */}
      <EvidenceViewer
        caseId={caseId}
        analysisId={analysisId}
        target={viewerTarget}
        onClose={() => setViewerTarget(null)}
      />
    </div>
  )
}

// ─── Stat card ────────────────────────────────────────────────────────────────

function StatCard({
  label,
  value,
  sub,
  danger,
}: {
  label: string
  value: string
  sub?: string
  danger?: boolean
}) {
  return (
    <div className="rounded-[3px] border border-ink-line bg-ink-panel/60 px-4 py-3">
      <div className="eyebrow mb-1 text-parchment-muted/70">{label}</div>
      <div
        className={cn(
          'font-serif text-[1.5rem] font-semibold leading-none',
          danger ? 'text-status-contradicted' : 'text-gold',
        )}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 font-mono text-[10px] text-parchment-muted/60">{sub}</div>}
    </div>
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function RepositorySkeleton() {
  return (
    <div className="px-10 py-9 lg:px-12 xl:px-16">
      <div className="mb-8 space-y-3">
        <div className="h-6 w-48 animate-pulse rounded bg-ink-raised" />
        <div className="h-9 w-72 animate-pulse rounded bg-ink-raised" />
        <div className="h-4 w-96 animate-pulse rounded bg-ink-raised" />
      </div>
      <Panel className="space-y-3">
        {[...Array(8)].map((_, i) => (
          <div key={i} className="h-10 animate-pulse rounded bg-ink-raised" />
        ))}
      </Panel>
    </div>
  )
}
