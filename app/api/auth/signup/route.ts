import { NextResponse } from "next/server";
import { db } from "../../../../lib/db";
import { createSession, hashPassword } from "../../../../lib/auth";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim().slice(0, 100);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return NextResponse.json({ error: "Enter a valid email." }, { status: 400 });
    if (password.length < 8) return NextResponse.json({ error: "Password must be at least 8 characters." }, { status: 400 });
    const result = await db.query("INSERT INTO users (email, password_hash, name) VALUES ($1, $2, $3) RETURNING id, email, name", [email, await hashPassword(password), name || null]);
    const user = result.rows[0];
    await createSession(user.id);
    return NextResponse.json({ user });
  } catch (error: unknown) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: string }).code === "23505") return NextResponse.json({ error: "An account with that email already exists." }, { status: 409 });
    console.error(error);
    return NextResponse.json({ error: "Unable to create account." }, { status: 500 });
  }
}
