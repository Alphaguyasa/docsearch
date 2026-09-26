import Link from "next/link";

import { CandleMark } from "./FigureSymbol";
import { getDict } from "../i18n/server";
import { ArrowRight, Lock } from "./Icons";

/**
 * The foot of every page, in the hero's night: the candle and the name, what
 * Not Alone is in one sentence, three short columns, and the small print —
 * where the texts come from and what this is not. Plain server HTML.
 */
export async function SiteFooter() {
  const { t } = await getDict();
  const f = t.footer;
  const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
    {
      title: f.explore,
      links: [
        { href: "/", label: f.tell },
        { href: "/people", label: f.people },
        { href: "/credits", label: f.credits },
      ],
    },
    {
      title: f.help,
      links: [
        { href: "/help", label: f.helpNow },
        { href: "tel:907", label: f.ambulance },
        { href: "tel:991", label: f.police },
      ],
    },
    { title: f.contact, links: [{ href: "mailto:alphaguyasa@gmail.com", label: f.questions }] },
  ];
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
            <p className="mt-5 max-w-sm font-serif text-[19px] leading-8 text-muted">{f.tagline}</p>
            <p className="mt-5 flex items-center gap-2 text-[13px] text-muted">
              <Lock className="h-3.5 w-3.5 text-gold/80" />
              {t.hero.privacy}
            </p>
          </div>

          <nav aria-label={f.nav} className="grid grid-cols-2 gap-8 sm:grid-cols-3">
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
          <p className="text-[14px] leading-6 text-foreground/85">{f.notice}</p>
          <Link
            href="/help"
            className="group inline-flex h-11 shrink-0 items-center justify-center gap-2 rounded-full bg-care px-5 text-[14px] font-medium text-background transition-transform active:scale-[0.97]"
          >
            {f.needHelp}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-white/10 pt-6 text-[12px] leading-5 text-muted sm:flex-row sm:justify-between">
          <p>{f.sources}</p>
          <p className="shrink-0">{f.care}</p>
        </div>
      </div>
    </footer>
  );
}
