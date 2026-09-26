import type { Metadata } from "next";
import { Newsreader } from "next/font/google";
import Link from "next/link";

import { CandleMark } from "./components/FigureSymbol";

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
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg">
          Skip to content
        </a>
        <header className="night relative z-20 border-b border-border">
          <nav className="mx-auto flex h-14 max-w-5xl items-center gap-5 px-4 text-sm sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-serif text-lg font-medium tracking-tight">
              <CandleMark className="h-6 w-6 text-gold" />
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
            <Link
              href="/help"
              className="ml-auto rounded-full border border-border px-3 py-1.5 text-foreground transition-colors hover:border-gold"
            >
              Need help now?
            </Link>
          </nav>
        </header>
        <div id="main">{children}</div>
        <footer className="mx-auto max-w-5xl border-t border-border px-4 py-8 text-sm leading-6 text-muted sm:px-6">
          <p>
            Not Alone is not a counselling or emergency service. If you are in danger,{" "}
            <Link href="/help" className="text-foreground underline underline-offset-4">
              find help now
            </Link>
            .
          </p>
          <p className="mt-1">
            Questions or corrections:{" "}
            <a href="mailto:alphaguyasa@gmail.com" className="underline underline-offset-4 hover:text-foreground">
              alphaguyasa@gmail.com
            </a>
          </p>
        </footer>
      </body>
    </html>
  );
}
