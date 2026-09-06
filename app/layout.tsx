import type { Metadata } from "next";
import "./globals.css";
import { getCurrentUser } from "../lib/auth";
import AuthScreen from "./components/AuthScreen";

export const metadata: Metadata = {
  title: "KChat — Private AI Workspace",
  description: "A premium, local-first AI workspace with BYOK.",
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const user = await getCurrentUser();
  return <html lang="en"><body>{user ? children : <AuthScreen />}</body></html>;
}
