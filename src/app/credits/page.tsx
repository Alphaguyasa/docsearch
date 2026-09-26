import { ART, artByline } from "../art";

export const metadata = { title: "Image credits — Not Alone" };

/** Every image on the site: what it is, who made it, and the licence it is used under. */
export default function CreditsPage() {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-20 pt-10 sm:px-6 sm:pt-16">
      <h1 className="font-serif text-[2rem] leading-tight sm:text-4xl">Image credits</h1>
      <p className="mt-3 max-w-prose leading-7 text-muted">
        The paintings on Not Alone are in the public domain. Photographs are used under the licence shown. All were
        found through Wikimedia Commons; follow a link to see the original and its full details.
      </p>
      <ul className="mt-8 divide-y divide-border border-y border-border">
        {ART.map((a) => (
          <li key={a.id} className="py-4 text-sm leading-6">
            <p className="font-serif text-lg">{a.caption}</p>
            <p className="text-muted">
              {artByline(a)} ·{" "}
              {a.licenseUrl ? (
                <a href={a.licenseUrl} className="underline underline-offset-4 hover:text-foreground">
                  {a.license}
                </a>
              ) : (
                a.license
              )}{" "}
              ·{" "}
              <a href={a.source} className="underline underline-offset-4 hover:text-foreground">
                Source
              </a>
            </p>
          </li>
        ))}
      </ul>
    </main>
  );
}
