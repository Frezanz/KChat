import type { Metadata } from "next";
import "./globals.css";
import AuthScreen from "./components/AuthScreen";
import AccountBar from "./components/AccountBar";

export const metadata: Metadata = {
  title: "KChat — Private AI Workspace",
  description: "A premium, local-first AI workspace with BYOK.",
};

export const dynamic = "force-dynamic";

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body><AccountBar>{children}</AccountBar><AuthScreen /></body></html>;
}
