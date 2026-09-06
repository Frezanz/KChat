import { Pool } from "pg";

const globalForDb = globalThis as unknown as { kchatPool?: Pool };

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
