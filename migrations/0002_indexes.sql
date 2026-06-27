-- migrations/0002_indexes.sql
CREATE INDEX IF NOT EXISTS idx_claims_pleading ON claims(pleading_id);
CREATE INDEX IF NOT EXISTS idx_analyses_pleading ON analyses(pleading_id);
