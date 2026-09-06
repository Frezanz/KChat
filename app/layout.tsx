import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'KChat — AI, made personal',
  description: 'A premium personal AI chat workspace with your own API key.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
