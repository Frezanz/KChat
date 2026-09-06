"use client";

import { ReactNode } from "react";
import { LogOut, UserRound } from "lucide-react";

type Props = { email: string; children: ReactNode };

export default function AccountBar({ email, children }: Props) {
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.reload();
  }

  return <>
    {children}
    <div className="account-bar"><span><UserRound size={14}/> {email}</span><button onClick={logout} title="Sign out"><LogOut size={14}/> Sign out</button></div>
  </>;
}
