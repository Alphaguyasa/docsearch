import Link from "next/link";

import resources from "../../../data/crisis-resources.json";

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
    <main className="mx-auto max-w-2xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
      <h1 className="font-display text-[2.3rem] font-semibold leading-tight sm:text-5xl">If you are in danger, reach someone now.</h1>
      <p lang="am" className="mt-2 font-serif text-xl text-muted">
        አደጋ ላይ ከሆኑ፣ አሁኑኑ ሰው ያግኙ።
      </p>
      <p className="mt-4 leading-7">
        You matter more than anything you have done or anything done to you. Talking to someone today is the next
        right step.
      </p>

      <ul className="mt-8 grid gap-3 sm:grid-cols-2">
        {phones.map((r) => (
          <li key={r.name}>
            <a
              href={`tel:${"phone" in r ? r.phone : ""}`}
              className="flex h-full flex-col border-2 border-care px-5 py-4 transition-colors hover:bg-care/10"
            >
              <span className="font-serif text-4xl font-medium text-care">{"phone" in r ? r.phone : ""}</span>
              <span className="mt-1 font-medium">{r.name}</span>
              <span className="text-sm text-muted">{r.detail} · tap to call</span>
            </a>
          </li>
        ))}
      </ul>

      <ul className="mt-6 space-y-4">
        {others.map((r) => (
          <li key={r.name} className="border-l-2 border-border pl-4">
            {"url" in r && r.url ? (
              <a href={r.url} target="_blank" rel="noreferrer" className="font-medium text-accent underline underline-offset-4">
                {r.name}
              </a>
            ) : (
              <span className="font-medium">{r.name}</span>
            )}
            <span className="block text-sm leading-6 text-muted">{r.detail}</span>
          </li>
        ))}
      </ul>

      <ul className="mt-8 space-y-2 border-t border-border pt-6 leading-7">
        {resources.always.map((s) => (
          <li key={s}>{s}</li>
        ))}
      </ul>

      <p className="mt-10 text-sm text-muted">
        When you are safe, the stories are still here.{" "}
        <Link href="/" className="underline underline-offset-4 hover:text-foreground">
          Back to Not Alone
        </Link>
      </p>
    </main>
  );
}
