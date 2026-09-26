import Link from "next/link";

import resources from "../../../data/crisis-resources.json";
import { Building, Globe, Phone } from "../components/Icons";

export const metadata = { title: "Help now — Not Alone" };

/**
 * Reachable from every page, no search needed. Plain server HTML: it must load
 * on the worst connection and work with JavaScript off. Phone numbers are
 * large tap targets that dial directly.
 */
export default function HelpPage() {
  const phones = resources.global.filter((r) => "phone" in r && r.phone);
  const others = resources.global.filter((r) => !("phone" in r && r.phone));
  return (
    <main className="pb-24">
      <section className="mx-auto max-w-3xl px-4 pt-14 text-center sm:px-6 sm:pt-24">
        <p className="font-caps text-[13px] font-semibold tracking-[0.2em] text-care">Help now</p>
        <h1 className="mt-4 font-display text-[2.6rem] font-semibold leading-[1.04] sm:text-7xl">
          If you are in danger, reach someone now.
        </h1>
        <p lang="am" className="mt-4 font-serif text-2xl text-muted">
          አደጋ ላይ ከሆኑ፣ አሁኑኑ ሰው ያግኙ።
        </p>
        <p className="mx-auto mt-6 max-w-xl font-serif text-[20px] leading-8">
          You matter more than anything you have done or anything done to you. Talking to someone today is the next
          right step.
        </p>
      </section>

      <section aria-label="Call" className="mx-auto mt-14 max-w-4xl px-4 sm:px-6">
        <ul className="grid gap-4 sm:grid-cols-2">
          {phones.map((r) => (
            <li key={r.name}>
              <a
                href={`tel:${"phone" in r ? r.phone : ""}`}
                className="group flex h-full items-center gap-5 rounded-[22px] bg-care/[0.08] p-6 ring-1 ring-care/30 transition-[background-color,transform] duration-300 hover:bg-care/[0.14] active:scale-[0.99] sm:p-8"
              >
                <span className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-care text-background">
                  <Phone className="h-6 w-6" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-5xl font-semibold leading-none text-care">
                    {"phone" in r ? r.phone : ""}
                  </span>
                  <span className="mt-2 block font-medium">{r.name}</span>
                  <span className="block text-sm text-muted">{r.detail} · tap to call</span>
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
                  className="flex h-full items-start gap-4 rounded-[22px] bg-foreground/[0.05] p-6 ring-1 ring-border transition-colors duration-300 hover:bg-foreground/[0.08]"
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
          Right now
        </h2>
        <ol className="mt-5 space-y-4">
          {resources.always.map((s, i) => (
            <li key={s} className="flex gap-4 font-serif text-[19px] leading-8">
              <span className="font-display text-3xl font-semibold leading-8 text-gold">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-12 text-muted">
          When you are safe, the stories are still here.{" "}
          <Link href="/" className="text-accent hover:underline">
            Back to Not Alone
          </Link>
        </p>
      </section>
    </main>
  );
}
