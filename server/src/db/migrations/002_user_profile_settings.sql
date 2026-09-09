-- Migration 002: User profile & settings enhancement
-- Adds bio, custom_avatar_url, and structured settings JSONB to users table

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS custom_avatar_url TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS settings JSONB NOT NULL DEFAULT '{
    "ai": {
      "provider": "gemini",
      "model": "gemini-2.5-flash",
      "temperature": 0.3
    },
    "research": {
      "research_depth": "standard",
      "response_depth": "detailed",
      "citation_style": "inline"
    },
    "privacy": {
      "save_search_history": true,
      "analytics_opt_in": false
    }
  }'::jsonb;

-- GIN index for querying user settings if needed
CREATE INDEX IF NOT EXISTS idx_users_settings ON users USING gin (settings);
