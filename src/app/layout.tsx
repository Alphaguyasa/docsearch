import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import Link from "next/link";

import { CandleMark } from "./components/FigureSymbol";
import { JsonLd } from "./components/JsonLd";
import { ServiceWorker } from "./components/ServiceWorker";
import { SiteFooter } from "./components/SiteFooter";
import { LangProvider, LangToggle } from "./i18n/client";
import { getDict } from "./i18n/server";
import { SiteHeader } from "./components/SiteHeader";

import "./globals.css";

// Church type: EB Garamond for reading (the face of the old Bibles and
// prayer books), Cormorant Garamond for headings, Cinzel (Roman inscription
// capitals) for the name and small labels, Noto Serif Ethiopic for Amharic.
// The files live in ./fonts (OFL 1.1, from @fontsource; see fonts/README.md)
// rather than next/font/google, whose build-time download from Google Fonts
// failed CI builds now and then ("queries have exactly one entry").
const reading = localFont({
  src: [{ path: "./fonts/eb-garamond-latin-wght-normal.woff2", weight: "400 800", style: "normal" }],
  variable: "--font-reading",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});
const display = localFont({
  src: [
    { path: "./fonts/cormorant-garamond-latin-500-normal.woff2", weight: "500", style: "normal" },
    { path: "./fonts/cormorant-garamond-latin-500-italic.woff2", weight: "500", style: "italic" },
    { path: "./fonts/cormorant-garamond-latin-600-normal.woff2", weight: "600", style: "normal" },
    { path: "./fonts/cormorant-garamond-latin-600-italic.woff2", weight: "600", style: "italic" },
  ],
  variable: "--font-display-face",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});
const caps = localFont({
  src: [
    { path: "./fonts/cinzel-latin-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/cinzel-latin-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-caps-face",
  display: "swap",
  adjustFontFallback: "Times New Roman",
});
// Not preloaded: these are the heaviest files on the site, and only Amharic
// pages use them (globals.css --eth-face); on English pages the few Amharic
// words fall back to the phone's own Ethiopic font.
const ethiopic = localFont({
  src: [
    { path: "./fonts/noto-serif-ethiopic-ethiopic-400-normal.woff2", weight: "400", style: "normal" },
    { path: "./fonts/noto-serif-ethiopic-ethiopic-600-normal.woff2", weight: "600", style: "normal" },
  ],
  variable: "--font-ethiopic",
  display: "swap",
  preload: false,
  adjustFontFallback: "Times New Roman",
});

const DESCRIPTION =
  "Tell what you are struggling with, and read the true stories of holy people who fell the same way and were restored — cited from Scripture and the Church Fathers.";

export const metadata: Metadata = {
  metadataBase: new URL("https://not-alone-seven.vercel.app"),
  title: { default: "Not Alone", template: "%s" },
  description: DESCRIPTION,
  applicationName: "Not Alone",
  icons: { apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Not Alone", statusBarStyle: "black" },
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

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const { lang, t } = await getDict();
  return (
    <html lang={lang} className={`${reading.variable} ${display.variable} ${caps.variable} ${ethiopic.variable}`}>
      <body className="antialiased">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-50 focus:bg-accent focus:px-3 focus:py-2 focus:text-accent-fg"
        >
          {t.nav.skip}
        </a>
        <LangProvider lang={lang}>
          <SiteHeader>
            <nav className="mx-auto flex h-12 max-w-6xl items-center gap-4 whitespace-nowrap px-4 text-[13px] sm:gap-6 sm:px-6">
              <Link
                href="/"
                lang="en"
                className="flex shrink-0 items-center gap-2 font-caps text-[14px] font-semibold tracking-[0.1em] sm:text-[15px] sm:tracking-[0.12em]"
              >
                <CandleMark className="h-6 w-6 text-gold" />
                Not Alone
              </Link>
              <Link href="/people" className="text-muted transition-colors hover:text-foreground">
                {t.nav.people}
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
              <div className="ml-auto flex shrink-0 items-center gap-2 sm:gap-3">
                <LangToggle />
                <Link
                  href="/help"
                  className="shrink-0 rounded-full bg-white/10 px-3 py-1.5 text-foreground transition-colors hover:bg-gold hover:text-background sm:px-3.5"
                >
                  <span className="min-[420px]:hidden">{t.nav.helpShort}</span>
                  <span className="hidden min-[420px]:inline">{t.nav.needHelp}</span>
                </Link>
              </div>
            </nav>
          </SiteHeader>
          <div id="main">{children}</div>
          <SiteFooter />
          <ServiceWorker />
          <JsonLd
            data={{
              "@context": "https://schema.org",
              "@type": "WebSite",
              name: "Not Alone",
              alternateName: "እርስዎ ብቻ አይደሉም",
              url: "https://not-alone-seven.vercel.app",
              inLanguage: ["en", "am"],
            }}
          />
        </LangProvider>
      </body>
    </html>
  );
}
