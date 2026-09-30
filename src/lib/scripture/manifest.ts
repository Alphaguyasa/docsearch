/**
 * Pure helpers for the scripture corpus manifest. No I/O — unit-tested.
 * The fetcher (scripts/fetch-scripture.ts) does the network and disk work.
 */

export type SourceStatus = "verified" | "verified-at-fetch" | "resolve" | "deferred" | "blocked";

export interface SourceConfig {
  id: string;
  title: string;
  kind: "scripture" | "tradition";
  format: "usfm-zip" | "gutenberg-txt" | "archive-djvu-txt";
  url?: string;
  archiveQuery?: string;
  /** Words every matching archive.org title must contain. Defaults to `title`. */
  titleHint?: string;
  /** Reviewed archive.org identifiers, in volume order. Overrides archiveQuery. */
  archiveIds?: string[];
  license: string;
  status: SourceStatus;
  note?: string;
}

export interface ManifestFile {
  name: string;
  url: string;
  sha256: string;
  bytes: number;
  /** archive.org identifier, when the file came from there. */
  archiveId?: string;
}

export interface ManifestEntry {
  id: string;
  title: string;
  kind: SourceConfig["kind"];
  format: SourceConfig["format"];
  license: string;
  retrievedAt: string;
  files: ManifestFile[];
}

export interface Manifest {
  version: 1;
  generatedAt: string;
  entries: ManifestEntry[];
}

/** Sources the fetcher should attempt. Deferred and blocked ones are skipped. */
export function activeSources(sources: SourceConfig[]): SourceConfig[] {
  return sources.filter((s) => s.status !== "deferred" && s.status !== "blocked");
}

interface ArchiveDoc {
  identifier: string;
  title?: string;
  year?: string | number;
  mediatype?: string;
}

/**
 * Choose archive.org items for a source from an advancedsearch response.
 * Keeps text items whose title contains every significant word of `titleHint`,
 * and orders them by identifier so multi-volume works come out in volume order.
 */
export function pickArchiveItems(docs: ArchiveDoc[], titleHint: string): ArchiveDoc[] {
  const words = titleHint
    .toLowerCase()
    .replace(/[^a-z\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3);
  return docs
    .filter((d) => (d.mediatype ?? "texts") === "texts")
    .filter((d) => {
      const t = (d.title ?? "").toLowerCase();
      return words.every((w) => t.includes(w));
    })
    .sort((a, b) => a.identifier.localeCompare(b.identifier));
}

/** archive.org lending-library items cannot be downloaded anonymously. */
export function isRestricted(metadata: Record<string, unknown> | undefined): boolean {
  const v = metadata?.["access-restricted-item"];
  return v === true || v === "true";
}

/** From archive.org /metadata files[], the OCR full-text file name, if any. */
export function pickDjvuText(files: { name: string }[]): string | null {
  const hit = files.find((f) => f.name.endsWith("_djvu.txt"));
  return hit ? hit.name : null;
}

/** Throws listing every problem. */
export function validateManifest(m: Manifest): void {
  const problems: string[] = [];
  const ids = new Set<string>();
  for (const e of m.entries) {
    if (ids.has(e.id)) problems.push(`duplicate entry ${e.id}`);
    ids.add(e.id);
    if (!e.license) problems.push(`${e.id}: missing license`);
    if (e.files.length === 0) problems.push(`${e.id}: no files`);
    for (const f of e.files) {
      if (!/^[0-9a-f]{64}$/.test(f.sha256)) problems.push(`${e.id}/${f.name}: bad sha256`);
      if (!(f.bytes > 0)) problems.push(`${e.id}/${f.name}: empty file`);
      if (!/^https:\/\//.test(f.url)) problems.push(`${e.id}/${f.name}: non-https url`);
    }
  }
  if (problems.length) throw new Error(`manifest invalid:\n  ${problems.join("\n  ")}`);
}
