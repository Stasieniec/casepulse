-- migrations/0001_init.sql
CREATE TABLE cases (id TEXT PRIMARY KEY, name TEXT, parties TEXT, court TEXT, claim_no TEXT, created_at TEXT);
CREATE TABLE documents (id TEXT PRIMARY KEY, case_id TEXT, tab INTEGER, title TEXT, doc_type TEXT, party TEXT, source_uri TEXT, text TEXT);
CREATE TABLE pleadings (id TEXT PRIMARY KEY, case_id TEXT, title TEXT, full_text TEXT, created_at TEXT);
CREATE TABLE claims (id TEXT PRIMARY KEY, pleading_id TEXT, case_id TEXT, label TEXT, paragraph_ref TEXT, text TEXT,
  span_start INTEGER, span_end INTEGER, status TEXT, risk_score INTEGER, headline TEXT);
CREATE TABLE edges (id TEXT PRIMARY KEY, claim_id TEXT, document_id TEXT, relation TEXT, confidence REAL, quote TEXT, rationale TEXT);
CREATE TABLE redteam (id TEXT PRIMARY KEY, claim_id TEXT, attack_type TEXT, attack_text TEXT, killshot_quote TEXT, fix_suggestion TEXT);
CREATE TABLE analyses (id TEXT PRIMARY KEY, case_id TEXT, pleading_id TEXT, overall_score INTEGER, counts_json TEXT, verdict TEXT, vulnerabilities_json TEXT, created_at TEXT);
CREATE INDEX idx_claims_case ON claims(case_id);
CREATE INDEX idx_edges_claim ON edges(claim_id);
CREATE INDEX idx_docs_case ON documents(case_id);
