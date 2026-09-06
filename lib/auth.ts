import bcrypt from "bcryptjs";
import crypto from "crypto";
import { cookies } from "next/headers";
import { db, ensureDatabaseSchema } from "./db";

export const SESSION_COOKIE = "kchat_session";
const SESSION_DAYS = 30;

export const hashPassword = (password: string) => bcrypt.hash(password, 12);
export const verifyPassword = (password: string, hash: string) => bcrypt.compare(password, hash);
export const createToken = () => crypto.randomBytes(32).toString("base64url");
export const hashToken = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  await ensureDatabaseSchema();
  const token = createToken();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db.query(
    "INSERT INTO sessions (user_id, token_hash, expires_at) VALUES ($1, $2, $3)",
    [userId, hashToken(token), expiresAt]
  );
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 86_400,
  });
}

export async function getCurrentUser() {
  await ensureDatabaseSchema();
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const result = await db.query(
    `SELECT u.id, u.email, u.name FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = $1 AND s.expires_at > NOW()` ,
    [hashToken(token)]
  );
  return result.rows[0] ?? null;
}

export async function destroyCurrentSession() {
  await ensureDatabaseSchema();
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await db.query("DELETE FROM sessions WHERE token_hash = $1", [hashToken(token)]);
  }
  store.delete(SESSION_COOKIE);
}
