"use client";

import { FormEvent, useState } from "react";
import { Sparkles } from "lucide-react";

export default function AuthScreen() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Authentication failed.");
      window.location.reload();
    } catch (err) { setError(err instanceof Error ? err.message : "Authentication failed."); setBusy(false); }
  }

  return <main className="auth-screen"><form className="auth-card" onSubmit={submit}>
    <div className="auth-brand"><span className="brand-logo"><Sparkles size={18}/></span><strong>KChat<span>.</span></strong></div>
    <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
    <p className="auth-subtitle">Sign in to keep your KChat workspace available across devices.</p>
    {mode === "signup" && <label className="field"><span>Name</span><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Your name" /></label>}
    <label className="field"><span>Email</span><input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" /></label>
    <label className="field"><span>Password</span><input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" /></label>
    {error && <div className="auth-error">{error}</div>}
    <button className="primary auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
    <button type="button" className="auth-switch" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); }}>{mode === "login" ? "New to KChat? Create an account" : "Already have an account? Sign in"}</button>
  </form></main>;
}
