import Link from "next/link";

import { CandleMark } from "./FigureSymbol";
import { ArrowRight, Lock } from "./Icons";

const COLUMNS: { title: string; links: { href: string; label: string; external?: boolean }[] }[] = [
  {
    title: "Explore",
    links: [
      { href: "/", label: "Tell what you carry" },
      { href: "/people", label: "The people" },
      { href: "/credits", label: "Image credits" },
    ],
  },
  {
    title: "Help",
    links: [
      { href: "/help", label: "Help now · እርዳታ" },
      { href: "tel:907", label: "Ambulance · 907" },
      { href: "tel:991", label: "Police · 991" },
    ],
  },
  {
    title: "Contact",
    links: [{ href: "mailto:alphaguyasa@gmail.com", label: "Questions or corrections", external: true }],
  },
];

/**
 * The foot of every page, in the hero's night: the candle and the name, what
 * Not Alone is in one sentence, three short columns, and the small print —
 * where the texts come from and what this is not. Plain server HTML.
 */
export function SiteFooter() {
  return (
    <footer className="night relative overflow-hidden border-t border-border">
      <div className="candle-still pointer-events-none absolute inset-0 opacity-60" aria-hidden />
      <div className="relative mx-auto max-w-6xl px-4 pb-10 pt-16 sm:px-6 sm:pt-20">
        <div className="grid gap-12 md:grid-cols-[1.4fr_2fr]">
          <div>
            <Link
              href="/"
              className="inline-flex items-center gap-2.5 font-caps text-[15px] font-semibold tracking-[0.12em]"
            >
              <CandleMark className="h-7 w-7 text-gold" />
              Not Alone
            </Link>
            <p className="mt-5 max-w-sm font-serif text-[19px] leading-8 text-muted">
              True stories of holy people who fell and were restored — from Scripture and the Church Fathers.
            </p>
            <p className="mt-5 flex items-center gap-2 text-[13px] text-muted">
              <Lock className="h-3.5 w-3.5 text-gold/80" />
              Nothing you write is saved.
            </p>
          </div>

          <nav aria-label="Footer" className="grid grid-cols-2 gap-8 sm:grid-cols-3">
            {COLUMNS.map((col) => (
              <div key={col.title}>
                <p className="font-caps text-[12px] font-semibold tracking-[0.2em] text-gold">{col.title}</p>
                <ul className="mt-4 space-y-3 text-[14px]">
                  {col.links.map((l) => (
                    <li key={l.href}>
                      {l.href.startsWith("/") ? (
                        <Link href={l.href} className="text-foreground/80 transition-colors hover:text-foreground">
                          {l.label}
                        </Link>
                      ) : (
                        <a href={l.href} className="text-foreground/80 transition-colors hover:text-foreground">
                          {l.label}
                        </a>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <div className="mt-14 flex flex-col gap-4 rounded-[22px] bg-white/[0.04] p-5 ring-1 ring-white/10 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <p className="text-[14px] leading-6 text-foreground/85">
            Not Alone is not a counselling or emergency service. If you are in danger, reach someone now.
          </p>
          <Link
            href="/help"
            className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-care px-5 text-[14px] font-medium text-background transition-transform active:scale-[0.97]"
          >
            Need help now?
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-[12px] leading-5 text-muted sm:flex-row sm:justify-between">
          <p>
            Scripture: World English Bible (public domain). Church Fathers: Augustine’s Confessions, the Lausiac
            History, the Paradise of the Holy Fathers, the Ethiopian Synaxarium.
          </p>
          <p className="shrink-0">Made with care for anyone carrying something alone.</p>
        </div>
      </div>
    </footer>
  );
}
