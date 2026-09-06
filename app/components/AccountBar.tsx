"use client";

import { ReactNode, useEffect, useState } from "react";
import { LogIn, LogOut, UserPlus, UserRound } from "lucide-react";

type Props = { children: ReactNode };
type User = { email: string };

function openAuth(mode: "login" | "signup") {
  window.location.href = `/?auth=${mode}`;
}

export default function AccountBar({ children }: Props) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    fetch("/api/auth/me", { cache: "no-store" })
      .then((response) => response.ok ? response.json() : null)
      .then((data) => { if (data?.user) setUser(data.user); })
      .catch(() => {});
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  return <>
    {children}
    <div className="account-bar">
      {user ? <><span><UserRound size={14}/> {user.email}</span><button onClick={logout} title="Sign out"><LogOut size={14}/> Sign out</button></> : <><span><UserRound size={14}/> Guest mode</span><div className="guest-auth-actions"><button onClick={() => openAuth("login")} title="Sign in"><LogIn size={14}/> Sign in</button><button onClick={() => openAuth("signup")} title="Create account"><UserPlus size={14}/> Sign up</button></div></>}
    </div>
  </>;
}
