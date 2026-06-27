# CasePulse — AI Case-Theory Stress-Test

> Paste a pleading. Before opposing counsel does it for you, see exactly where your own evidence bundle breaks your case — allegation by allegation, sourced to the line, then watch the tool play opposing counsel.

Built for **Hack The Law 2026** (Cambridge), Challenge 5 *"Pleading-to-Proof"* (CMS × Harvey).

Most legal-AI surfaces documents *related* to your case. CasePulse tells you whether your pleaded case can actually be **proved on the evidence** — and it's auditable to the verbatim line.

---

## What it does

Given a litigation bundle (pleading + evidence), CasePulse:

1. **Extracts** every pleaded proposition from the pleading.
2. **Maps** each to the evidence as **supported / contradicted / evidence-gap / unaddressed** — via a two-stage pipeline (high-recall retrieval → LLM-judge **with abstention**), every edge carrying a **verbatim quote** you can click to verify in the source.
3. **Scores** trial-readiness and ranks the biggest vulnerabilities.
4. **Red-teams** the case: for each weak allegation it drafts the cross-examination / strike-out an opponent would make **using your own bundle**, plus a "fix before trial" note.
5. **Graphs** the case in **Neo4j** with real **Graph Data Science** — PageRank (pivotal evidence), Louvain (contradiction clusters), node-similarity (a graph-native "expected-but-missing evidence" detector).

## Why it's real (not a hardcoded demo)

- **Live pipeline.** `POST /api/analyze` runs the genuine engine (Gemini extract → embedding retrieval → LLM-judge with a 0.55 abstention threshold → aggregation → red-team). The **Extraction Lab** has a "Run it live" toggle that re-runs it on demand. Validated independently: run on the real Particulars, the engine re-derives the key contradictions (target-date, no-scope-change, >40%-downtime, no-sign-off, loss-of-profit) with the right verbatim kill-shots.
- **Real Neo4j Aura + GDS.** The graph and all graph algorithms run in a real Neo4j 5.27 Enterprise Aura instance via the HTTP Query API + Aura Graph Analytics (`gds.pageRank`, `gds.louvain`, `gds.nodeSimilarity`). Flip one env var (`GRAPH_PROVIDER=neo4j`) and the whole app reads live from Aura over Cypher.
- **Honest by construction.** Two-stage (not pure NLI, which scores ~16–37% precision on legal text); confidence + abstention on every edge; calibration reported on a hand-labeled gold set (`docs/calibration.md`); every classification source-linked. Human-in-the-loop — the lawyer keeps judgement.
- **Swappable providers.** `LlmProvider`, `GraphProvider`, `Retriever` are interfaces with multiple implementations (Gemini / Nvidia; Mock-seed / D1 / Neo4j; in-memory / Vectorize) — so the engine is portable to any bundle and any backend.

## The demo dataset

*Meridian Retail Group PLC v TechFlow Solutions Ltd* (`/data`) — a purpose-built synthetic commercial dispute (a £2.4m retail-platform build gone wrong). The seed analysis is the output of a real multi-agent LLM analysis of this bundle; it's reproducible by the live pipeline. **The same engine runs on any litigation bundle** — the UI is scoped to this curated dataset for demo reliability.

## Architecture

```
React SPA (Vite)  ──/api──>  Hono on Cloudflare Workers
  Extraction Lab · Dashboard               D1 (analysis persistence)
  Pleading x-ray · Force-graph             Gemini (extract / judge / red-team / embed)
  Red-Team memo                            Neo4j Aura + GDS (graph + analytics)
```

**Stack:** TypeScript · React/Vite · Hono · Cloudflare Workers + D1 · Google Gemini (`gemini-3.5-flash`, `gemini-embedding-001`) · Neo4j Aura (Graph Data Science) · built with Anthropic Claude Code.

## Run locally

```bash
npm install
# create .dev.vars (gitignored) with: GEMINI_API_KEY=...  (+ NEO4J_QUERY_URL/USER/PASSWORD for Neo4j mode)
npm run db:apply:local        # D1 schema
npm run build && npx wrangler dev   # serves SPA + API on :8787
npm test                      # unit + worker tests
```

The default demo runs on the materialized real analysis (instant, offline). `GRAPH_PROVIDER=neo4j` switches reads to live Aura; the Extraction Lab's "Run it live" exercises the full Gemini pipeline.

## Limitations (stated honestly)

- The demo bundle is synthetic (purpose-built for the challenge); numbers are not from a real judgment.
- The calibration gold set is small and hand-labeled — indicative, not a benchmark.
- Some pleaded questions (e.g. enforceability of a liability cap) are matters of law for the court, not for the tool.

---

*CasePulse — a stress test for your case theory: it shows where the case is strong, where it's weak, and where it flatlines, before the courtroom does.*
