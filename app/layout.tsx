import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "../lib/auth";
import AuthScreen from "./components/AuthScreen";
import AccountBar from "./components/AccountBar";

export const metadata: Metadata = {
  title: "KChat — Private AI Workspace",
  description: "A premium, local-first AI workspace with BYOK.",
};

export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  return <html lang="en"><body>{user ? <AccountBar email={user.email}>{children}</AccountBar> : <AuthScreen />}</body></html>;
}
