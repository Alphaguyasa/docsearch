import type { Metadata, Viewport } from "next";
import { Cinzel, Cormorant_Garamond, EB_Garamond, Noto_Serif_Ethiopic } from "next/font/google";
import Link from "next/link";

import { CandleMark } from "./components/FigureSymbol";
import { SiteHeader } from "./components/SiteHeader";

import "./globals.css";

// Church type: EB Garamond for reading (the face of the old Bibles and
// prayer books), Cormorant Garamond for headings, Cinzel (Roman inscription
// capitals) for the name and small labels, Noto Serif Ethiopic for Amharic.
const reading = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-reading",
  display: "swap",
});
const display = Cormorant_Garamond({
  subsets: ["latin"],
  weight: ["500", "600"],
  style: ["normal", "italic"],
  variable: "--font-display-face",
  display: "swap",
});
const caps = Cinzel({
  subsets: ["latin"],
  weight: ["400", "600"],
  variable: "--font-caps-face",
  display: "swap",
});
const ethiopic = Noto_Serif_Ethiopic({
  subsets: ["ethiopic"],
  weight: ["400", "600"],
  variable: "--font-ethiopic",
  display: "swap",
});

const DESCRIPTION =
  "Tell what you are struggling with, and read the true stories of holy people who fell the same way and were restored — cited from Scripture and the Church Fathers.";

export const metadata: Metadata = {
  metadataBase: new URL("https://not-alone-seven.vercel.app"),
  title: { default: "Not Alone", template: "%s" },
  description: DESCRIPTION,
  applicationName: "Not Alone",
  openGraph: {
    type: "website",
    siteName: "Not Alone",
    title: "Not Alone — You are not the only one",
    description: DESCRIPTION,
  },
  twitter: { card: "summary_large_image", title: "Not Alone — You are not the only one", description: DESCRIPTION },
};

export const viewport: Viewport = {
  themeColor: "#0b0907",
  colorScheme: "dark light",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${reading.variable} ${display.variable} ${caps.variable} ${ethiopic.variable}`}>
      <body className="antialiased">
        <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg">
          Skip to content
        </a>
        <SiteHeader>
          <nav className="mx-auto flex h-12 max-w-6xl items-center gap-6 px-4 text-[13px] sm:px-6">
            <Link href="/" className="flex items-center gap-2 font-caps text-[15px] font-semibold tracking-[0.12em]">
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
              className="ml-auto rounded-full bg-white/10 px-3.5 py-1.5 text-foreground transition-colors hover:bg-gold hover:text-background"
            >
              Need help now?
            </Link>
          </nav>
        </SiteHeader>
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
            {" · "}
            <Link href="/credits" className="underline underline-offset-4 hover:text-foreground">
              Image credits
            </Link>
          </p>
        </footer>
      </body>
    </html>
  );
}
