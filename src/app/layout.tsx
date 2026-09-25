import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import Link from "next/link";

import "./globals.css";

const reading = Newsreader({
  subsets: ["latin"],
  variable: "--font-reading",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Not Alone",
  description:
    "Tell what you are struggling with, and read the true stories of holy people who fell the same way and were restored — cited from Scripture and the Church Fathers.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={reading.variable}>
      <body className="antialiased">
        <header className="border-b border-border">
          <nav className="mx-auto flex h-12 max-w-3xl items-center gap-5 px-5 text-sm">
            <Link href="/" className="font-serif text-base font-semibold">
              Not Alone
            </Link>
            <Link href="/people" className="text-muted transition-colors hover:text-foreground">
              People
            </Link>
            {process.env.SHOW_DOCUMENTS === "1" && (
              <Link href="/documents" className="text-muted transition-colors hover:text-foreground">
                Documents
              </Link>
            )}
            {process.env.EVAL_DASHBOARD === "1" && (
              <Link href="/evals" className="text-muted transition-colors hover:text-foreground">
                Evals
              </Link>
            )}
          </nav>
        </header>
        {children}
        <footer className="mx-auto max-w-3xl border-t border-border px-5 py-6 text-sm text-muted">
          Not Alone is not a counselling or emergency service. Questions or corrections:{" "}
          <a href="mailto:alphaguyasa@gmail.com" className="underline underline-offset-4 hover:text-foreground">
            alphaguyasa@gmail.com
          </a>
        </footer>
      </body>
    </html>
  );
}
