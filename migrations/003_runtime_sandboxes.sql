CREATE TABLE IF NOT EXISTS runtime_sandboxes (
sandbox_id TEXT PRIMARY KEY,
user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS runtime_sandboxes_user_id_idx ON runtime_sandboxes(user_id);
