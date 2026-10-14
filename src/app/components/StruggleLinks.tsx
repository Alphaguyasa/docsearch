"use client";

import Link from "next/link";

import { useT } from "../i18n/client";
import { STRUGGLE_IDS } from "../struggles";

/** "Or find your struggle": one tap to the stories for each struggle. */
export function StruggleLinks() {
  const { t } = useT();
  return (
    <nav aria-labelledby="struggle-links-heading" className="mt-10">
      <p id="struggle-links-heading" className="font-caps text-[12px] font-semibold tracking-[0.2em] text-gold">
        {t.struggles.find}
      </p>
      <ul className="mt-4 flex flex-wrap gap-2">
        {STRUGGLE_IDS.map((id) => (
          <li key={id}>
            <Link
              href={`/struggles/${id}`}
              className="inline-flex min-h-10 items-center rounded-full bg-foreground/[0.06] px-4 text-[14px] ring-1 ring-foreground/10 transition-colors hover:bg-foreground/[0.1]"
            >
              {t.groups[id]}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
