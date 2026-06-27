/**
 * Typed D1 helpers.
 *
 * All D1 database access in the project goes through these functions.
 * Row types use snake_case to match the D1 schema column names.
 */

// ---- Analysis ---------------------------------------------------------------

export interface AnalysisRow {
  id: string
  case_id: string
  pleading_id: string
  overall_score: number
  counts_json: string      // JSON of {wellSupported, contested, contradicted, gaps, unaddressed}
  verdict: string
  vulnerabilities_json: string  // JSON string[]
  created_at: string
}

export async function insertAnalysis(db: D1Database, row: AnalysisRow): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO analyses
       (id, case_id, pleading_id, overall_score, counts_json, verdict, vulnerabilities_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.case_id,
      row.pleading_id,
      row.overall_score,
      row.counts_json,
      row.verdict,
      row.vulnerabilities_json,
      row.created_at,
    )
    .run()
}

export async function selectAnalysis(db: D1Database, analysisId: string): Promise<AnalysisRow | null> {
  const r = await db
    .prepare(`SELECT * FROM analyses WHERE id = ?`)
    .bind(analysisId)
    .first<AnalysisRow>()
  return r ?? null
}

// ---- Pleadings --------------------------------------------------------------

export interface PleadingRow {
  id: string
  case_id: string
  title: string
  full_text: string
  created_at: string
}

export async function insertPleading(db: D1Database, row: PleadingRow): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO pleadings (id, case_id, title, full_text, created_at)
       VALUES (?, ?, ?, ?, ?)`,
    )
    .bind(row.id, row.case_id, row.title, row.full_text, row.created_at)
    .run()
}

export async function selectPleading(db: D1Database, id: string): Promise<PleadingRow | null> {
  return (
    (await db.prepare(`SELECT * FROM pleadings WHERE id = ?`).bind(id).first<PleadingRow>()) ?? null
  )
}

// ---- Claims -----------------------------------------------------------------

export interface ClaimRow {
  id: string
  pleading_id: string
  case_id: string
  label: string
  paragraph_ref: string
  text: string
  span_start: number
  span_end: number
  status: string
  risk_score: number
  headline: string
}

export async function insertClaim(db: D1Database, row: ClaimRow): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO claims
       (id, pleading_id, case_id, label, paragraph_ref, text, span_start, span_end, status, risk_score, headline)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.pleading_id,
      row.case_id,
      row.label,
      row.paragraph_ref,
      row.text,
      row.span_start,
      row.span_end,
      row.status,
      row.risk_score,
      row.headline,
    )
    .run()
}

export async function selectClaimsByAnalysis(db: D1Database, analysisId: string): Promise<ClaimRow[]> {
  // Claims are linked to an analysis via pleading_id:
  //   analyses.pleading_id = pleadings.id = claims.pleading_id
  const result = await db
    .prepare(
      `SELECT c.* FROM claims c
       JOIN analyses a ON a.pleading_id = c.pleading_id
       WHERE a.id = ?`,
    )
    .bind(analysisId)
    .all<ClaimRow>()
  return result.results ?? []
}

// ---- Edges ------------------------------------------------------------------

export interface EdgeRow {
  id: string
  claim_id: string
  document_id: string
  relation: string
  confidence: number
  quote: string
  rationale: string
}

export async function insertEdge(db: D1Database, row: EdgeRow): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO edges
       (id, claim_id, document_id, relation, confidence, quote, rationale)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.claim_id,
      row.document_id,
      row.relation,
      row.confidence,
      row.quote,
      row.rationale,
    )
    .run()
}

export async function selectEdgesByAnalysis(db: D1Database, analysisId: string): Promise<EdgeRow[]> {
  const result = await db
    .prepare(
      `SELECT e.* FROM edges e
       JOIN claims c ON c.id = e.claim_id
       JOIN analyses a ON a.pleading_id = c.pleading_id
       WHERE a.id = ?`,
    )
    .bind(analysisId)
    .all<EdgeRow>()
  return result.results ?? []
}

// ---- Red team ---------------------------------------------------------------

export interface RedTeamRow {
  id: string
  claim_id: string
  attack_type: string
  attack_text: string
  killshot_quote: string
  fix_suggestion: string
}

export async function insertRedTeam(db: D1Database, row: RedTeamRow): Promise<void> {
  await db
    .prepare(
      `INSERT OR REPLACE INTO redteam
       (id, claim_id, attack_type, attack_text, killshot_quote, fix_suggestion)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      row.id,
      row.claim_id,
      row.attack_type,
      row.attack_text,
      row.killshot_quote,
      row.fix_suggestion,
    )
    .run()
}

export async function selectRedTeamByAnalysis(db: D1Database, analysisId: string): Promise<RedTeamRow[]> {
  const result = await db
    .prepare(
      `SELECT rt.* FROM redteam rt
       JOIN claims c ON c.id = rt.claim_id
       JOIN analyses a ON a.pleading_id = c.pleading_id
       WHERE a.id = ?`,
    )
    .bind(analysisId)
    .all<RedTeamRow>()
  return result.results ?? []
}
