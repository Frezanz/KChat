import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "KChat — Private AI Workspace",
  description: "A focused AI workspace powered by your own API key.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
