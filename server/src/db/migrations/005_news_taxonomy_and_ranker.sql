-- ============================================================
-- Migration 005: News Event Taxonomy, Provenance & Ranker Training Store
-- Additive migration — preserves all existing tables, rows and columns
-- ============================================================

-- 1. Add event_types array to events table
ALTER TABLE events ADD COLUMN IF NOT EXISTS event_types TEXT[] DEFAULT '{}';

-- 2. Add event_types array, scores, and external provenance to articles table
ALTER TABLE articles ADD COLUMN IF NOT EXISTS event_types TEXT[] DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS event_type_scores JSONB DEFAULT '{}';
ALTER TABLE articles ADD COLUMN IF NOT EXISTS external_provenance JSONB DEFAULT NULL;

-- 3. GIN Indexes for fast filtering on multi-label event types
CREATE INDEX IF NOT EXISTS idx_events_event_types ON events USING GIN (event_types);
CREATE INDEX IF NOT EXISTS idx_articles_event_types ON articles USING GIN (event_types);

-- 4. Additive store for ranker training and evaluation samples (historical and gold datasets)
CREATE TABLE IF NOT EXISTS ranker_training_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  query_text TEXT NOT NULL,
  query_intent TEXT NOT NULL,
  candidate_id UUID NOT NULL,
  candidate_type TEXT NOT NULL, -- 'article' or 'event'
  relevance_label INT NOT NULL, -- 0 (irrelevant) to 5 (direct answer)
  label_type TEXT NOT NULL DEFAULT 'WEAK_LABEL', -- 'HUMAN_REVIEWED' or 'WEAK_LABEL'
  features JSONB NOT NULL,
  sample_timestamp TIMESTAMPTZ NOT NULL,
  split TEXT NOT NULL, -- 'train', 'validation', 'test'
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_training_samples_split ON ranker_training_samples(split);
CREATE INDEX IF NOT EXISTS idx_training_samples_query_intent ON ranker_training_samples(query_intent);
CREATE INDEX IF NOT EXISTS idx_training_samples_timestamp ON ranker_training_samples(sample_timestamp);
