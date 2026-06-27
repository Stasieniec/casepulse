/**
 * runAnalysis — full extract→retrieve→judge→aggregate→red-team pipeline.
 *
 * Orchestrates the Gemini-powered live analysis pipeline:
 *  1. Extract claims from the pleading (Gemini).
 *  2. Map each claim back to its character span in the pleading text.
 *  3. Chunk and index all 18 evidence documents via the retriever.
 *  4. For each claim, topK retrieval → judgeEdge per candidate → aggregate status/risk.
 *  5. Red-team weak claims (contradicted/gap/contested) via Gemini.
 *  6. Persist everything to D1 under a new analysisId.
 */
import type { Env } from '../index'
import type { Claim, Edge, RedTeamItem } from '../../shared/types'
import { getLlmProvider } from './providers/llm'
import { getRetriever } from './providers/retriever'
import { mapClaimSpan } from './span'
import { chunkDoc } from './chunk'
import { aggregateClaim, computeStats } from './aggregate'
import { DOC_TEXTS } from './docs-data'
import { DOC_TITLES } from './seed-loader'
import {
  insertPleading,
  insertClaim,
  insertEdge,
  insertRedTeam,
  insertAnalysis,
} from './db'

export interface RunAnalysisInput {
  caseId: string
  pleadingText: string
}

export interface RunAnalysisResult {
  analysisId: string
  stats: {
    wellSupported: number
    contested: number
    contradicted: number
    gaps: number
    unaddressed: number
    overallScore: number
  }
  claimCount: number
  edgeCount: number
}

export async function runAnalysis(env: Env, input: RunAnalysisInput): Promise<RunAnalysisResult> {
  const { caseId, pleadingText } = input
  const db = env.DB
  const llm = getLlmProvider(env)
  const retriever = getRetriever(env, llm)

  // Unique IDs for this analysis run
  const analysisId = crypto.randomUUID()
  const pleadingId = `${caseId}-${analysisId}`
  const now = new Date().toISOString()

  // 1. Persist the pleading text so LiveGraphProvider can retrieve it later
  await insertPleading(db, {
    id: pleadingId,
    case_id: caseId,
    title: 'Particulars of Claim',
    full_text: pleadingText,
    created_at: now,
  })

  // 2. Extract claims from the pleading using the LLM
  const extractedClaims = await llm.extractClaims(pleadingText)

  // 3. Chunk all evidence documents and index them in the retriever
  const allChunks = Object.entries(DOC_TEXTS).flatMap(([docId, text]) =>
    chunkDoc(docId, text, { size: 600, overlap: 100 }),
  )
  await retriever.index(caseId, allChunks)

  // 4–6. Per claim: span → retrieve → judge → aggregate → red-team
  const claims: Claim[] = []
  const allEdges: Edge[] = []
  const redTeamItems: RedTeamItem[] = []

  for (let i = 0; i < extractedClaims.length; i++) {
    const ec = extractedClaims[i]
    const claimId = `${pleadingId}-C${i}`

    // Map the LLM-extracted claim text back to its character offsets in the pleading
    const { spanStart, spanEnd } = mapClaimSpan(pleadingText, ec.text)

    // Retrieve top-6 evidence chunks most similar to this claim
    const topChunks = await retriever.topK(caseId, ec.text, 6)

    // Judge each retrieved chunk for supports/contradicts/neutral
    const judgedEdges: Edge[] = []
    for (let j = 0; j < topChunks.length; j++) {
      const chunk = topChunks[j]
      const title = DOC_TITLES[chunk.documentId] ?? chunk.documentId
      const result = await llm.judgeEdge(ec.text, chunk.text, title)
      judgedEdges.push({
        id: `${claimId}-E${j}`,
        claimId,
        documentId: chunk.documentId,
        relation: result.relation,
        confidence: result.confidence,
        quote: result.quote,
        rationale: result.rationale,
      })
    }

    // Aggregate judged edges → status + riskScore (with abstention at 0.55 threshold)
    const { status, riskScore } = aggregateClaim(judgedEdges)

    const claim: Claim = {
      id: claimId,
      label: ec.label,
      paragraphRef: ec.paragraphRef,
      text: ec.text,
      spanStart,
      spanEnd,
      status,
      riskScore,
      headline: ec.text.slice(0, 80),
    }
    claims.push(claim)
    allEdges.push(...judgedEdges)

    // Red-team claims that are weak (contradicted, gap, or contested)
    if (status === 'contradicted' || status === 'gap' || status === 'contested') {
      const killEdges = judgedEdges.filter(e => e.relation === 'contradicts')
      const rt = await llm.redTeam(claim, killEdges)
      redTeamItems.push({
        id: `${claimId}-RT`,
        claimId,
        ...rt,
      })
    }
  }

  // 7. Compute overall case stats from all claims
  const stats = computeStats(claims)

  // 8. Persist claims to D1
  for (const c of claims) {
    await insertClaim(db, {
      id: c.id,
      pleading_id: pleadingId,
      case_id: caseId,
      label: c.label,
      paragraph_ref: c.paragraphRef,
      text: c.text,
      span_start: c.spanStart,
      span_end: c.spanEnd,
      status: c.status,
      risk_score: c.riskScore,
      headline: c.headline,
    })
  }

  // 9. Persist edges to D1
  for (const e of allEdges) {
    await insertEdge(db, {
      id: e.id,
      claim_id: e.claimId,
      document_id: e.documentId,
      relation: e.relation,
      confidence: e.confidence,
      quote: e.quote,
      rationale: e.rationale,
    })
  }

  // 10. Persist red-team items to D1
  for (const rt of redTeamItems) {
    await insertRedTeam(db, {
      id: rt.id,
      claim_id: rt.claimId,
      attack_type: rt.attackType,
      attack_text: rt.attackText,
      killshot_quote: rt.killshotQuote,
      fix_suggestion: rt.fixSuggestion,
    })
  }

  // 11. Persist the analysis summary row (pleading text is in pleadings table via pleadingId)
  await insertAnalysis(db, {
    id: analysisId,
    case_id: caseId,
    pleading_id: pleadingId,
    overall_score: stats.overallScore,
    counts_json: JSON.stringify({
      wellSupported: stats.wellSupported,
      contested: stats.contested,
      contradicted: stats.contradicted,
      gaps: stats.gaps,
      unaddressed: stats.unaddressed,
    }),
    verdict: stats.verdict,
    vulnerabilities_json: JSON.stringify(stats.biggestVulnerabilities),
    created_at: now,
  })

  return {
    analysisId,
    stats: {
      wellSupported: stats.wellSupported,
      contested: stats.contested,
      contradicted: stats.contradicted,
      gaps: stats.gaps,
      unaddressed: stats.unaddressed,
      overallScore: stats.overallScore,
    },
    claimCount: claims.length,
    edgeCount: allEdges.length,
  }
}
