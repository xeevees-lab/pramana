-- Migration 001: Core schema
-- All tables needed for PRAMĀṆA's core data model

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- ============================================
-- SOURCES
-- ============================================
CREATE TABLE IF NOT EXISTS sources (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('rss', 'gdelt', 'newsapi', 'api', 'manual')),
  url TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  reliability_score REAL DEFAULT 0.5 CHECK (reliability_score >= 0 AND reliability_score <= 1),
  last_fetched_at TIMESTAMPTZ,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sources_type ON sources(type);
CREATE INDEX idx_sources_enabled ON sources(enabled);

-- ============================================
-- USERS
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  firebase_uid TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL,
  display_name TEXT,
  photo_url TEXT,
  role TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_login_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_users_firebase_uid ON users(firebase_uid);
CREATE INDEX idx_users_email ON users(email);

-- ============================================
-- ARTICLES
-- ============================================
CREATE TABLE IF NOT EXISTS articles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  external_id TEXT,
  url TEXT,
  title TEXT NOT NULL,
  content TEXT,
  summary TEXT,
  author TEXT,
  published_at TIMESTAMPTZ,
  fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  image_url TEXT,
  image_attribution TEXT,
  language TEXT DEFAULT 'en',
  content_hash TEXT NOT NULL,
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_articles_content_hash ON articles(content_hash);
CREATE INDEX idx_articles_source ON articles(source_id);
CREATE INDEX idx_articles_published ON articles(published_at DESC);
CREATE INDEX idx_articles_title_trgm ON articles USING gin(title gin_trgm_ops);

-- ============================================
-- EVENTS (clustered articles about the same happening)
-- ============================================
CREATE TABLE IF NOT EXISTS events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  summary TEXT,
  category TEXT CHECK (category IN (
    'politics', 'conflict', 'diplomacy', 'economics', 'business',
    'markets', 'science', 'technology', 'environment', 'climate',
    'disasters', 'law', 'public_policy', 'international_affairs',
    'social', 'health', 'sports', 'culture', 'other'
  )),
  severity TEXT DEFAULT 'normal' CHECK (severity IN ('critical', 'high', 'normal', 'low')),
  status TEXT DEFAULT 'developing' CHECK (status IN ('developing', 'ongoing', 'resolved', 'historical')),
  location_name TEXT,
  country_code TEXT,
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  image_url TEXT,
  image_attribution TEXT,
  article_count INTEGER NOT NULL DEFAULT 0,
  source_count INTEGER NOT NULL DEFAULT 0,
  first_reported_at TIMESTAMPTZ,
  last_updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  generated_summary TEXT,
  generated_article TEXT,
  embedding vector(768),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_events_category ON events(category);
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_severity ON events(severity);
CREATE INDEX idx_events_country ON events(country_code);
CREATE INDEX idx_events_last_updated ON events(last_updated_at DESC);
CREATE INDEX idx_events_first_reported ON events(first_reported_at DESC);
CREATE INDEX idx_events_title_trgm ON events USING gin(title gin_trgm_ops);

-- ============================================
-- EVENT <-> ARTICLE junction
-- ============================================
CREATE TABLE IF NOT EXISTS event_articles (
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
  relevance_score REAL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (event_id, article_id)
);

CREATE INDEX idx_event_articles_article ON event_articles(article_id);

-- ============================================
-- ENTITIES
-- ============================================
CREATE TABLE IF NOT EXISTS entities (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN (
    'person', 'organization', 'country', 'city', 'location',
    'topic', 'policy', 'law', 'document'
  )),
  description TEXT,
  wikidata_id TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_entities_type ON entities(type);
CREATE INDEX idx_entities_name_trgm ON entities USING gin(name gin_trgm_ops);
CREATE UNIQUE INDEX idx_entities_name_type ON entities(name, type);

-- ============================================
-- ENTITY <-> EVENT junction
-- ============================================
CREATE TABLE IF NOT EXISTS entity_events (
  entity_id UUID NOT NULL REFERENCES entities(id) ON DELETE CASCADE,
  event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  role TEXT DEFAULT 'related',
  confidence REAL DEFAULT 1.0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (entity_id, event_id)
);

CREATE INDEX idx_entity_events_event ON entity_events(event_id);

-- ============================================
-- CLAIMS
-- ============================================
CREATE TABLE IF NOT EXISTS claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
  text TEXT NOT NULL,
  normalized_text TEXT,
  claim_type TEXT NOT NULL DEFAULT 'factual' CHECK (claim_type IN (
    'factual', 'causal', 'predictive', 'opinion', 'statistical'
  )),
  information_class TEXT NOT NULL DEFAULT 'fact' CHECK (information_class IN (
    'fact', 'context', 'narrative_signal', 'model_interpretation', 'ml_forecast'
  )),
  verification_status TEXT NOT NULL DEFAULT 'UNVERIFIED' CHECK (verification_status IN (
    'VERIFIED', 'UNVERIFIED', 'CONTRADICTED'
  )),
  extracted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_checked_at TIMESTAMPTZ,
  content_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_claims_content_hash ON claims(content_hash);
CREATE INDEX idx_claims_event ON claims(event_id);
CREATE INDEX idx_claims_article ON claims(article_id);
CREATE INDEX idx_claims_status ON claims(verification_status);
CREATE INDEX idx_claims_type ON claims(claim_type);
CREATE INDEX idx_claims_info_class ON claims(information_class);

-- ============================================
-- EVIDENCE
-- ============================================
CREATE TABLE IF NOT EXISTS evidence (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  claim_id UUID NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
  article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
  source_id UUID REFERENCES sources(id) ON DELETE SET NULL,
  type TEXT NOT NULL CHECK (type IN ('supports', 'contradicts')),
  text TEXT NOT NULL,
  url TEXT,
  confidence REAL DEFAULT 0.5 CHECK (confidence >= 0 AND confidence <= 1),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_evidence_claim ON evidence(claim_id);
CREATE INDEX idx_evidence_type ON evidence(type);
CREATE INDEX idx_evidence_article ON evidence(article_id);

-- ============================================
-- NARRATIVES
-- ============================================
CREATE TABLE IF NOT EXISTS narratives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  description TEXT,
  platform TEXT,
  share_pct REAL,
  momentum REAL DEFAULT 0,
  acceleration REAL DEFAULT 0,
  sample_size INTEGER,
  sample_limited BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_narratives_event ON narratives(event_id);
CREATE INDEX idx_narratives_platform ON narratives(platform);

-- ============================================
-- FORECASTS
-- ============================================
CREATE TABLE IF NOT EXISTS forecasts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  outcome_description TEXT NOT NULL,
  probability REAL NOT NULL CHECK (probability >= 0 AND probability <= 1),
  uncertainty_lower REAL CHECK (uncertainty_lower >= 0 AND uncertainty_lower <= 1),
  uncertainty_upper REAL CHECK (uncertainty_upper >= 0 AND uncertainty_upper <= 1),
  time_horizon TEXT NOT NULL,
  time_horizon_end TIMESTAMPTZ,
  model_version TEXT NOT NULL,
  features JSONB DEFAULT '{}',
  evidence_refs JSONB DEFAULT '[]',
  training_sample_size INTEGER,
  predicted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved BOOLEAN NOT NULL DEFAULT false,
  actual_outcome TEXT,
  resolved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_forecasts_event ON forecasts(event_id);
CREATE INDEX idx_forecasts_resolved ON forecasts(resolved);
CREATE INDEX idx_forecasts_predicted ON forecasts(predicted_at DESC);

-- ============================================
-- BACKGROUND JOBS
-- ============================================
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  type TEXT NOT NULL,
  payload JSONB DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'running', 'completed', 'failed', 'cancelled'
  )),
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 3,
  dedup_key TEXT,
  error TEXT,
  result JSONB,
  next_retry_at TIMESTAMPTZ,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX idx_jobs_dedup ON jobs(dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX idx_jobs_status ON jobs(status);
CREATE INDEX idx_jobs_type ON jobs(type);
CREATE INDEX idx_jobs_next_retry ON jobs(next_retry_at) WHERE status = 'pending';

-- ============================================
-- FACT CHECK SUBMISSIONS
-- ============================================
CREATE TABLE IF NOT EXISTS fact_checks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  submission_type TEXT NOT NULL CHECK (submission_type IN ('url', 'text', 'image')),
  submission_content TEXT NOT NULL,
  submission_url TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending', 'processing', 'completed', 'failed'
  )),
  result JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ
);

CREATE INDEX idx_fact_checks_user ON fact_checks(user_id);
CREATE INDEX idx_fact_checks_status ON fact_checks(status);

-- ============================================
-- LIVE FEED ENTRIES
-- ============================================
CREATE TABLE IF NOT EXISTS live_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  event_id UUID REFERENCES events(id) ON DELETE SET NULL,
  entry_type TEXT NOT NULL CHECK (entry_type IN (
    'new_event', 'new_evidence', 'claim_status_change',
    'new_contradiction', 'narrative_shift', 'new_source',
    'forecast_update'
  )),
  title TEXT NOT NULL,
  description TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_live_entries_created ON live_entries(created_at DESC);
CREATE INDEX idx_live_entries_type ON live_entries(entry_type);
CREATE INDEX idx_live_entries_event ON live_entries(event_id);

-- ============================================
-- VECTOR INDEXES (HNSW for fast cosine search)
-- ============================================
CREATE INDEX idx_articles_embedding ON articles USING hnsw (embedding vector_cosine_ops);
CREATE INDEX idx_events_embedding ON events USING hnsw (embedding vector_cosine_ops);
