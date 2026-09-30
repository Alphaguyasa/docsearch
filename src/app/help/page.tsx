import Link from "next/link";

import resources from "../../../data/crisis-resources.json";
import { ArrowRight, Building, Globe, Phone } from "../components/Icons";
import { getDict } from "../i18n/server";

export const metadata = { title: "Help now — Not Alone" };

/**
 * Reachable from every page, no search needed. Plain server HTML: it must load
 * on the worst connection and work with JavaScript off. Phone numbers are
 * large tap targets that dial directly.
 */
export default async function HelpPage() {
  const { t } = await getDict();
  const h = t.help;
  const phones = resources.global.filter((r) => "phone" in r && r.phone);
  const others = resources.global.filter((r) => !("phone" in r && r.phone));
  return (
    <main className="pb-24">
      <section className="mx-auto max-w-3xl px-4 pt-14 text-center sm:px-6 sm:pt-24">
        <p className="font-caps text-[13px] font-semibold tracking-[0.2em] text-care">{h.eyebrow}</p>
        <h1 className="mt-4 font-display text-[2.6rem] font-semibold leading-[1.04] sm:text-7xl">{h.title}</h1>
        <p lang={h.subtitleLang} className="mt-4 font-serif text-2xl text-muted">
          {h.subtitle}
        </p>
        <p className="mx-auto mt-6 max-w-xl font-serif text-[20px] leading-8">{h.body}</p>
      </section>

      <section aria-label={h.call} className="mx-auto mt-14 max-w-4xl px-4 sm:px-6">
        <ul className="grid gap-4 sm:grid-cols-2">
          {phones.map((r) => (
            <li key={r.name}>
              <a
                href={`tel:${"phone" in r ? r.phone : ""}`}
                className="paper group relative flex h-full items-center gap-5 overflow-hidden rounded-[22px] p-6 ring-1 ring-care/35 transition-[box-shadow,transform] duration-300 hover:shadow-[0_0_50px_-18px_rgb(232_150_150_/_0.5)] active:scale-[0.98] sm:p-8"
              >
                <span className="call-pulse grid h-14 w-14 shrink-0 place-items-center rounded-full bg-care text-background">
                  <Phone className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-5xl font-semibold leading-none text-care">
                    {"phone" in r ? r.phone : ""}
                  </span>
                  <span className="mt-2 block font-medium">{r.name}</span>
                  <span className="block text-sm text-muted">
                    {r.detail} · {h.tap}
                  </span>
                </span>
              </a>
            </li>
          ))}
        </ul>

        <ul className="mt-4 grid gap-4 sm:grid-cols-2">
          {others.map((r) => {
            const link = "url" in r && r.url ? r.url : undefined;
            const Tag = link ? "a" : "div";
            return (
              <li key={r.name}>
                <Tag
                  {...(link ? { href: link, target: "_blank", rel: "noreferrer" } : {})}
                  className="paper flex h-full items-start gap-4 rounded-[22px] p-6 ring-1 ring-border transition-[box-shadow,transform] duration-300 hover:shadow-[0_0_40px_-18px_rgb(232_181_96_/_0.35)] active:scale-[0.99]"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-foreground/10 text-foreground">
                    {link ? <Globe className="h-5 w-5" /> : <Building className="h-5 w-5" />}
                  </span>
                  <span className="min-w-0">
                    <span className={`block font-medium ${link ? "text-accent" : ""}`}>{r.name}</span>
                    <span className="mt-1 block text-sm leading-6 text-muted">{r.detail}</span>
                  </span>
                </Tag>
              </li>
            );
          })}
        </ul>
      </section>

      <section aria-labelledby="now-heading" className="mx-auto mt-16 max-w-3xl px-4 sm:px-6">
        <h2 id="now-heading" className="font-display text-3xl font-semibold">
          {h.now}
        </h2>
        <ol className="mt-5 space-y-3">
          {resources.always.map((s, i) => (
            <li
              key={s}
              className="paper flex gap-4 rounded-[22px] p-5 font-serif text-[19px] leading-8 ring-1 ring-border sm:p-6"
            >
              <span className="font-display text-3xl font-semibold leading-8 text-gold">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <div className="mt-12 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
          <p className="text-muted">{h.safe}</p>
          <Link
            href="/"
            className="group inline-flex h-11 items-center gap-2 rounded-full bg-foreground/[0.06] px-5 text-[14px] ring-1 ring-foreground/10 transition-colors hover:bg-foreground/[0.1]"
          >
            {h.back}
            <ArrowRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>
    </main>
  );
}
