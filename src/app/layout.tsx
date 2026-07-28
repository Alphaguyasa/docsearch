import type { Metadata } from "next";
import Link from "next/link";

import "./globals.css";

export const metadata: Metadata = {
  title: "DocSearch",
  description: "Cited answers grounded in the document corpus.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <header className="border-b border-border">
          <nav className="mx-auto flex h-12 max-w-5xl items-center gap-5 px-6 text-sm">
            <span className="font-semibold tracking-tight">DocSearch</span>
            <Link href="/" className="text-muted transition-colors hover:text-foreground">
              Search
            </Link>
            <Link
              href="/documents"
              className="text-muted transition-colors hover:text-foreground"
            >
              Documents
            </Link>
            {/* Only linked when the dashboard is switched on: the route 404s
                otherwise, and a nav item leading to a 404 reads as a bug. */}
            {process.env.EVAL_DASHBOARD === "1" && (
              <Link
                href="/evals"
                className="text-muted transition-colors hover:text-foreground"
              >
                Evals
              </Link>
            )}
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
