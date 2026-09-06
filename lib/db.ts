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
        CREATE EXTENSION IF NOT EXISTS pgcrypto;

        CREATE TABLE IF NOT EXISTS users (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          email TEXT NOT NULL UNIQUE,
          password_hash TEXT NOT NULL,
          name TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE TABLE IF NOT EXISTS sessions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
          token_hash TEXT NOT NULL UNIQUE,
          expires_at TIMESTAMPTZ NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );

        CREATE INDEX IF NOT EXISTS sessions_user_id_idx ON sessions(user_id);
        CREATE INDEX IF NOT EXISTS sessions_expires_at_idx ON sessions(expires_at);
      `);
    })().catch((error) => {
      globalForDb.kchatSchemaReady = undefined;
      throw error;
    });
  }

  return globalForDb.kchatSchemaReady;
}
