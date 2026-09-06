"use client";

import { FormEvent, useEffect, useState } from "react";
import { Sparkles, X } from "lucide-react";

export default function AuthScreen() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requested = params.get("auth");
    if (requested === "login" || requested === "signup") {
      setMode(requested);
      setOpen(true);
    }
  }, []);

  function close() {
    setOpen(false);
    const url = new URL(window.location.href);
    url.searchParams.delete("auth");
    window.history.replaceState({}, "", url.pathname + (url.search ? url.search : "") + url.hash);
  }

  function switchMode(next: "login" | "signup") {
    setMode(next); setError("");
    const url = new URL(window.location.href);
    url.searchParams.set("auth", next);
    window.history.replaceState({}, "", url.pathname + url.search + url.hash);
  }

  async function submit(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch(mode === "login" ? "/api/auth/login" : "/api/auth/signup", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Authentication failed.");
      window.location.href = "/";
    } catch (err) { setError(err instanceof Error ? err.message : "Authentication failed."); setBusy(false); }
  }

  if (!open) return null;

  return <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) close(); }}><main className="auth-screen auth-screen-modal"><form className="auth-card" onSubmit={submit}>
    <button type="button" className="icon-btn auth-close" onClick={close} aria-label="Continue as guest"><X size={18}/></button>
    <div className="auth-brand"><span className="brand-logo"><Sparkles size={18}/></span><strong>KChat<span>.</span></strong></div>
    <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
    <p className="auth-subtitle">{mode === "login" ? "Sign in to sync your KChat workspace across devices." : "Create an account to keep your workspace available across devices."}</p>
    {mode === "signup" && <label className="field"><span>Name</span><input value={name} onChange={e => setName(e.target.value)} autoComplete="name" placeholder="Your name" /></label>}
    <label className="field"><span>Email</span><input required type="email" value={email} onChange={e => setEmail(e.target.value)} autoComplete="email" placeholder="you@example.com" /></label>
    <label className="field"><span>Password</span><input required minLength={8} type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" /></label>
    {error && <div className="auth-error">{error}</div>}
    <button className="primary auth-submit" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : "Create account"}</button>
    <button type="button" className="auth-switch" onClick={() => switchMode(mode === "login" ? "signup" : "login")}>{mode === "login" ? "New to KChat? Create an account" : "Already have an account? Sign in"}</button>
    <button type="button" className="auth-guest-link" onClick={close}>Continue without an account</button>
  </form></main></div>;
}
