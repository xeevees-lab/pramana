-- Migration 003: Causal & Temporal Intelligence Layer
-- Tables for evidence-grounded causal links, temporal milestones, and syndication tracking

-- ============================================
-- CAUSAL RELATIONSHIPS
-- ============================================
CREATE TABLE IF NOT EXISTS causal_relationships (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  cause_text TEXT NOT NULL,
  effect_text TEXT NOT NULL,
  relationship_type TEXT NOT NULL CHECK (relationship_type IN (
    'precondition', 'trigger', 'mechanism', 'chain_reaction',
    'amplifier', 'immediate_consequence', 'secondary_effect', 'human_response'
  )),
  is_directly_supported BOOLEAN NOT NULL DEFAULT true,
  confidence REAL DEFAULT 0.8 CHECK (confidence >= 0 AND confidence <= 1),
  evidence_refs JSONB DEFAULT '[]',
  source_ids UUID[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_causal_event ON causal_relationships(event_id);
CREATE INDEX IF NOT EXISTS idx_causal_type ON causal_relationships(relationship_type);
CREATE INDEX IF NOT EXISTS idx_causal_direct ON causal_relationships(is_directly_supported);

-- ============================================
-- TEMPORAL MILESTONES
-- ============================================
CREATE TABLE IF NOT EXISTS temporal_milestones (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE CASCADE,
  timestamp TIMESTAMPTZ NOT NULL,
  temporal_relation TEXT NOT NULL CHECK (temporal_relation IN (
    'before', 'trigger_point', 'during', 'immediate_aftermath', 'subsequent'
  )),
  description TEXT NOT NULL,
  source_url TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_temporal_event ON temporal_milestones(event_id);
CREATE INDEX IF NOT EXISTS idx_temporal_time ON temporal_milestones(timestamp ASC);
CREATE INDEX IF NOT EXISTS idx_temporal_relation ON temporal_milestones(temporal_relation);

-- ============================================
-- SYNDICATION & WIRE TRACKING ON ARTICLES
-- ============================================
ALTER TABLE articles
  ADD COLUMN IF NOT EXISTS wire_service TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS syndication_cluster_id UUID DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_articles_wire_service ON articles(wire_service);
CREATE INDEX IF NOT EXISTS idx_articles_syndication ON articles(syndication_cluster_id);
