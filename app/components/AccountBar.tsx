"use client";

import { ReactNode, useEffect, useState } from "react";
import { LogIn, LogOut, UserPlus, UserRound } from "lucide-react";

type Props = { children: ReactNode };
type User = { email: string };

function openAuth(mode: "login" | "signup") {
  window.location.href = `/?auth=${mode}`;
}

export default function AccountBar({ children }: Props) {
  return <>{children}</>;
}
