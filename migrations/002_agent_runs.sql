CREATE TABLE IF NOT EXISTS agent_runs (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  agent_id TEXT,
  agent_name TEXT NOT NULL,
  prompt TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('running','waiting_approval','completed','failed','cancelled')),
  sandbox_id TEXT,
  step INTEGER NOT NULL DEFAULT 0,
  transcript JSONB NOT NULL DEFAULT '[]'::jsonb,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS agent_runs_user_updated_idx ON agent_runs(user_id, updated_at DESC);
