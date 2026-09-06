import { Pool } from "pg";

const globalForDb = globalThis as unknown as { kchatPool?: Pool; kchatSchemaReady?: Promise<void> };

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not configured");
}

export const db = globalForDb.kchatPool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
  ssl: process.env.DATABASE_SSL === "false" ? false : { rejectUnauthorized: false },
});

if (process.env.NODE_ENV !== "production") globalForDb.kchatPool = db;

export async function ensureDatabaseSchema() {
  if (!globalForDb.kchatSchemaReady) {
    globalForDb.kchatSchemaReady = (async () => {
      await db.query(`
        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY,
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id UUID PRIMARY KEY,
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);

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
      `);
    })().catch((error) => {
      globalForDb.kchatSchemaReady = undefined;
      throw error;
    });
  }

  return globalForDb.kchatSchemaReady;
}
