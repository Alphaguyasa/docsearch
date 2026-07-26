/**
 * Golden set review tool — Phase 1 of docs/EVAL_HARNESS.md.
 *
 *   npm run eval:review
 *
 * Shows one candidate at a time with its source chunk text, and accepts:
 *   a  accept  — append to eval/golden/questions.jsonl
 *   e  edit    — open in $EDITOR, then accept the edited version
 *   d  drop    — reject permanently
 *   s  skip    — leave undecided, show again next run
 *   q  quit
 *
 * Resumable: every id you decide on is recorded in eval/golden/.reviewed and is
 * never shown again. Skipped ids are deliberately NOT recorded, so an
 * interrupted session resumes exactly where it stopped.
 *
 * This step is the whole point of Phase 1. Model-written questions are often
 * trivially lexical — they repeat the passage's rare words, so retrieval scores
 * high without demonstrating anything. Rewrite those with different vocabulary
 * or drop them.
 */
import "../src/lib/loadenv";

import { spawnSync } from "node:child_process";
import {
  appendFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { createInterface } from "node:readline";

import { cached } from "../eval/src/cache";
import { loadCorpus, type CorpusChunk } from "../eval/src/corpus";
import { DEV_FILE, formatHeader, parseJsonl } from "../eval/src/goldenset";
import { sortForReview } from "../eval/src/triage";
import type { Question } from "../eval/src/types";

const CANDIDATES = "eval/golden/questions.candidate.jsonl";
/**
 * Newly accepted questions land in DEV, never in the holdout.
 *
 * The holdout is fixed at split time and must stay that way: a question added to
 * it after the fact was chosen with knowledge of how the system behaves, which
 * is the leak the holdout exists to prevent. Growing the set means growing dev,
 * and re-splitting deliberately if a bigger holdout is ever wanted.
 */
const ACCEPTED = DEV_FILE;
const REVIEWED = "eval/golden/.reviewed";

/** Skips `#` header lines — the dev/holdout files carry the split parameters. */
function readJsonl<T>(file: string): T[] {
  if (!existsSync(file)) return [];
  return parseJsonl<T>(file).rows;
}

function loadReviewed(): Set<string> {
  if (!existsSync(REVIEWED)) return new Set();
  return new Set(
    readFileSync(REVIEWED, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
}

function markReviewed(id: string, decision: string): void {
  mkdirSync(path.dirname(REVIEWED), { recursive: true });
  appendFileSync(REVIEWED, `${id}\n`);
  void decision;
}

function accept(question: Question): void {
  mkdirSync(path.dirname(ACCEPTED), { recursive: true });
  appendFileSync(ACCEPTED, JSON.stringify(question) + "\n");
}

/** Read a single keypress without waiting for Enter. */
function readKey(): Promise<string> {
  return new Promise((resolve) => {
    const stdin = process.stdin;
    const wasRaw = stdin.isRaw;
    if (stdin.isTTY) stdin.setRawMode(true);
    stdin.resume();
    stdin.once("data", (buf: Buffer) => {
      if (stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
      stdin.pause();
      const key = buf.toString("utf8");
      // Ctrl-C must still quit even in raw mode, where the OS no longer sends
      // SIGINT for us.
      if (key === "") {
        console.log("\n\nInterrupted.");
        process.exit(130);
      }
      resolve(key.toLowerCase());
    });
  });
}

/** Fallback for non-TTY stdin (piped input, some CI shells). */
function readLineFallback(prompt: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim().toLowerCase().slice(0, 1));
    });
  });
}

/**
 * Open the question in $EDITOR as JSON and read the result back.
 *
 * The edited text must still parse as a Question, and edits that would break the
 * type's invariants are rejected rather than written — a hand-edited row with a
 * non-null expectedAnswer on an unanswerable question would silently corrupt the
 * refusal metric.
 */
function editInEditor(question: Question): Question | null {
  const editor =
    process.env.EDITOR ??
    process.env.VISUAL ??
    (process.platform === "win32" ? "notepad" : "vi");

  const tmpDir = path.join("eval", ".cache", "review");
  mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `${question.id}.json`);
  writeFileSync(tmpFile, JSON.stringify(question, null, 2));

  const result = spawnSync(editor, [tmpFile], { stdio: "inherit", shell: true });
  if (result.error) {
    console.log(`\n  Could not launch "${editor}": ${result.error.message}`);
    return null;
  }

  let edited: Question;
  try {
    edited = JSON.parse(readFileSync(tmpFile, "utf8")) as Question;
  } catch (err) {
    console.log(`\n  Edited file is not valid JSON (${errorMessage(err)}) — not accepted.`);
    return null;
  }

  if (!edited.question?.trim()) {
    console.log("\n  Edited question text is empty — not accepted.");
    return null;
  }
  if (edited.type === "unanswerable" && edited.expectedAnswer !== null) {
    console.log("\n  Unanswerable questions must have expectedAnswer: null — not accepted.");
    return null;
  }
  if (edited.type !== "unanswerable" && edited.relevantChunkIds.length === 0) {
    console.log("\n  Answerable questions need at least one relevantChunkId — not accepted.");
    return null;
  }
  return edited;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

// --- Live retrieval probe for unanswerable questions -------------------------

/** Top matches for a question, used to test the "not in the corpus" claim. */
interface Probe {
  chunkId: string;
  filename: string;
  page: number | null;
  content: string;
  similarity: number;
}

const PROBE_DEPTH = 3;

/**
 * Give up on the probe after this long and let the reviewer proceed.
 *
 * src/lib/embed.ts retries a failed request five times starting at a 20s
 * backoff — correct for a batch ingest that must not lose work, and completely
 * wrong here: it would freeze the review screen for up to ten minutes per
 * question with no way to continue. The probe is evidence, not a gate, so a slow
 * one is simply dropped. The underlying request is left running; if it lands
 * later it populates the cache and appears on the next redraw.
 */
const PROBE_TIMEOUT_MS = 25_000;

/**
 * Cache key matches scripts/validate-golden-set.ts exactly, so an embedding paid
 * for by one tool is free in the other. Voyage's free tier is 3 requests/min —
 * the slowest limit in the project — so this matters more than it looks.
 */
const probeCache = new Map<string, Probe[] | { error: string }>();

async function probeCorpus(
  question: Question,
  chunks: Map<string, CorpusChunk>,
): Promise<Probe[] | { error: string }> {
  const hit = probeCache.get(question.id);
  if (hit) return hit;

  try {
    // Imported lazily: reviewing answerable questions needs no embedding
    // credentials and must not pay the import cost of the Voyage client.
    const { db } = await import("../src/lib/db");
    const { embedQuery } = await import("../src/lib/embed");

    const embedding = await cached(
      "question-embedding",
      { model: "voyage-4", inputType: "query", text: question.question },
      () => embedQuery(question.question),
    );

    const match = await db.rpc("match_chunks", {
      query_embedding: JSON.stringify(embedding),
      match_count: PROBE_DEPTH,
    });
    if (match.error) throw new Error(match.error.message);

    const rows = (match.data ?? []) as {
      id: string;
      content: string;
      page_number: number | null;
      similarity: number;
    }[];

    const probes: Probe[] = rows.map((r) => ({
      chunkId: r.id,
      filename: chunks.get(r.id)?.filename ?? "(unknown)",
      page: r.page_number,
      content: r.content,
      similarity: r.similarity,
    }));
    probeCache.set(question.id, probes);
    return probes;
  } catch (err) {
    // A failed probe must not block the review. It is evidence, not a gate —
    // and losing a session's decisions to a network blip would be far worse.
    const failure = { error: errorMessage(err) };
    probeCache.set(question.id, failure);
    return failure;
  }
}

/** `absent` or `near-miss`, as recorded in the generator's notes. */
function unanswerableFlavour(question: Question): "absent" | "near-miss" | null {
  if (question.notes?.startsWith("near-miss")) return "near-miss";
  if (question.notes?.startsWith("absent")) return "absent";
  return null;
}

/** The file the question was drafted against, from the generator's notes. */
function draftedAgainst(question: Question): string | null {
  return question.notes?.match(/drafted against (.+)$/)?.[1] ?? null;
}

function wrap(text: string, width = 76, indent = "  "): string {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if (line.length + word.length + 1 > width) {
      lines.push(line);
      line = word;
    } else {
      line = line ? `${line} ${word}` : word;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => indent + l).join("\n");
}

/**
 * Unanswerable questions get a DIFFERENT screen, deliberately.
 *
 * Shown beside a source chunk like every other candidate, the implicit question
 * a reviewer answers is "is this answerable here?" — and for an unanswerable
 * candidate the answer is always no, so the whole bucket gets dropped by
 * construction. That is exactly what happened: all 28 were rejected in one pass.
 *
 * The real question is the opposite one: is the answer genuinely ABSENT from the
 * corpus, and is the question plausible enough that a careless system would try?
 * So there is no "source chunk" here. Instead the corpus is searched live and
 * the top matches shown as EVIDENCE AGAINST the candidate: if one of them
 * answers the question, it is not unanswerable and should be dropped.
 */
function renderUnanswerable(
  question: Question,
  probe: Probe[] | { error: string } | null,
): void {
  const flavour = unanswerableFlavour(question);

  console.log("\n" + "▓".repeat(80));
  console.log("  THIS QUESTION SHOULD HAVE NO ANSWER IN THE CORPUS");
  console.log("▓".repeat(80));
  console.log(
    wrap(
      "Do NOT judge it by whether a passage answers it — none should. Judge it " +
        "on two things: (1) the answer is genuinely absent from the corpus, and " +
        "(2) the question is plausible enough that a careless system would " +
        "answer it anyway. Accept if both hold.",
    ),
  );

  if (flavour === "near-miss") {
    console.log("\n  FLAVOUR: near-miss (adversarial)");
    console.log(
      wrap(
        "The corpus contains a SIMILAR fact with a different value. This " +
          "question presupposes the wrong one. A careless system will " +
          "confidently answer with the real value; a correct system refuses. " +
          "Check the matches below: the real value should be visible in one of " +
          "them, and it should NOT be what this question presupposes.",
        76,
        "  ",
      ),
    );
    // The generator asked the model for a question, not for what it perturbed,
    // so the specific altered value was never recorded. The retrieved passages
    // below are the practical substitute — the real value lives in them.
    console.log(
      wrap(
        "(The generator did not record which value was altered; the passages " +
          "below are where the true one lives.)",
        76,
        "  ",
      ),
    );
  } else if (flavour === "absent") {
    console.log("\n  FLAVOUR: plausible-but-absent");
    console.log(
      wrap(
        "On-topic for the corpus, but the specific fact should simply not be " +
          "there. If a passage below does answer it, drop this candidate.",
        76,
        "  ",
      ),
    );
  }

  const source = draftedAgainst(question);
  if (source) console.log(`\n  drafted against: ${source}`);

  console.log(`\nTOP ${PROBE_DEPTH} CORPUS MATCHES (live retrieval)`);
  if (probe === null) {
    console.log("  searching the corpus...");
  } else if ("error" in probe) {
    console.log(`  ⚠ retrieval failed: ${probe.error}`);
    console.log(
      wrap(
        "Judge without it, or skip [s] and retry later. A failed probe is not " +
          "evidence that nothing matches.",
        76,
        "  ",
      ),
    );
  } else if (probe.length === 0) {
    console.log("  Nothing retrieved — strong evidence the answer is absent.");
  } else {
    for (const [i, p] of probe.entries()) {
      const page = p.page === null ? "" : `, p.${p.page}`;
      console.log(
        `\n  ${i + 1}. ${p.filename}${page}   similarity ${p.similarity.toFixed(3)}`,
      );
      // Truncated: the reviewer needs enough to see whether it answers the
      // question, not the whole passage.
      const text = p.content.length > 600 ? p.content.slice(0, 600) + "…" : p.content;
      console.log(wrap(text, 76, "     "));
    }
    console.log(
      "\n" +
        wrap(
          "If any passage above answers the question, this is NOT unanswerable " +
            "— drop it.",
          76,
          "  ",
        ),
    );
  }
}

function render(
  question: Question,
  chunks: Map<string, CorpusChunk>,
  index: number,
  total: number,
  probe: Probe[] | { error: string } | null = null,
): void {
  console.clear();
  console.log("═".repeat(80));
  console.log(
    `  ${question.id}   ${question.type}   ${question.difficulty}` +
      `        [${index + 1} of ${total}]`,
  );
  console.log("═".repeat(80));

  // Advisory flag from generation triage. Shown prominently because these are
  // the candidates most likely to need a rewrite or a drop — but the call is
  // still the reviewer's, so nothing is pre-decided here.
  if (question.suspect) {
    const label = question.suspect === "lexical" ? "LEXICAL OVERLAP" : "NEAR-DUPLICATE";
    console.log(`\n⚠ FLAGGED — ${label}`);
    if (question.suspectDetail) console.log(wrap(question.suspectDetail));
    console.log(
      question.suspect === "lexical"
        ? wrap(
            "This question reuses its source passage's distinctive wording, so " +
              "retrieval can match on a shared rare term rather than on meaning. " +
              "Rewrite it with different vocabulary, or drop it.",
          )
        : wrap("This restates a question already in the set. Usually a drop."),
    );
  }

  console.log("\nQUESTION");
  console.log(wrap(question.question));

  console.log("\nEXPECTED ANSWER");
  console.log(
    question.expectedAnswer === null
      ? "  (none — this question must be refused)"
      : wrap(question.expectedAnswer),
  );

  if (question.notes) console.log(`\nNOTES\n  ${question.notes}`);

  if (question.type === "unanswerable") {
    renderUnanswerable(question, probe);
  } else if (question.relevantChunkIds.length === 0) {
    console.log("\nSOURCE");
    console.log("  No relevant chunk. The correct behaviour is a refusal.");
  } else {
    console.log("\nSOURCE CHUNK(S)");
    for (const id of question.relevantChunkIds) {
      const chunk = chunks.get(id);
      if (!chunk) {
        console.log(`\n  [${id}] MISSING FROM DB — drop this candidate.`);
        continue;
      }
      const page = chunk.pageNumber === null ? "" : `, p.${chunk.pageNumber}`;
      console.log(`\n  ── ${chunk.filename}${page} ──`);
      console.log(wrap(chunk.content, 76, "  "));
    }
  }

  console.log("\n" + "─".repeat(80));
  console.log("  [a]ccept   [e]dit   [d]rop   [s]kip   [q]uit");
  process.stdout.write("  > ");
}

/** Rewrite questions.jsonl without `ids`. Used when a cascade drop removes an
 *  already-accepted paraphrase. */
function removeFromAccepted(ids: Set<string>): number {
  // The header carries the split seed and rule. Rewriting the file without it
  // would silently discard the provenance of every number computed from it.
  const { header, rows } = parseJsonl<Question>(ACCEPTED);
  const kept = rows.filter((q) => !ids.has(q.id));

  writeFileSync(
    ACCEPTED,
    (header.length > 0 ? formatHeader(header) : "") +
      kept.map((q) => JSON.stringify(q)).join("\n") +
      "\n",
  );
  return rows.length - kept.length;
}

/**
 * Warn before dropping a question that has paraphrase children, and offer to
 * take them with it.
 *
 * Returns "cancel" to abort the drop, or a count of children dropped.
 */
async function confirmCascade(
  question: Question,
  candidates: Question[],
): Promise<"cancel" | { dropped: number }> {
  const children = candidates.filter((c) => c.paraphraseOf === question.id);
  if (children.length === 0) return { dropped: 0 };

  const reviewed = loadReviewed();
  const acceptedIds = new Set(readJsonl<Question>(ACCEPTED).map((q) => q.id));

  const alreadyAccepted = children.filter((c) => acceptedIds.has(c.id));
  const pending = children.filter((c) => !reviewed.has(c.id));
  const alreadyDropped = children.filter(
    (c) => reviewed.has(c.id) && !acceptedIds.has(c.id),
  );

  // Nothing left to orphan — every child is already gone.
  if (alreadyAccepted.length === 0 && pending.length === 0) return { dropped: 0 };

  console.clear();
  console.log("═".repeat(80));
  console.log(`  ⚠ ${question.id} HAS ${children.length} PARAPHRASE CHILD(REN)`);
  console.log("═".repeat(80));
  console.log(
    wrap(
      "Dropping this question orphans them: each keeps a paraphraseOf pointing " +
        "at an id no longer in the set, which fails validation and quietly " +
        "reweights the paraphrase bucket toward whatever survives.",
    ),
  );

  console.log(`\nPARENT (dropping)\n${wrap(question.question)}`);

  if (alreadyAccepted.length > 0) {
    console.log(`\nALREADY ACCEPTED — in ${ACCEPTED} (${alreadyAccepted.length})`);
    for (const c of alreadyAccepted) console.log(`\n  ${c.id}\n${wrap(c.question, 74, "    ")}`);
  }
  if (pending.length > 0) {
    console.log(`\nSTILL IN THE QUEUE (${pending.length})`);
    for (const c of pending) console.log(`\n  ${c.id}\n${wrap(c.question, 74, "    ")}`);
  }
  if (alreadyDropped.length > 0) {
    console.log(`\n  (${alreadyDropped.length} child(ren) already dropped — unaffected)`);
  }

  console.log("\n" + "─".repeat(80));
  console.log("  [y] drop the children too      — removes accepted ones, skips queued ones");
  console.log("  [n] keep them                  — WILL orphan any accepted child");
  console.log("  [c] cancel, don't drop parent");
  process.stdout.write("  > ");

  for (;;) {
    const key = process.stdin.isTTY ? await readKey() : await readLineFallback("");
    if (key === "c") return "cancel";

    if (key === "y") {
      const ids = new Set([...alreadyAccepted, ...pending].map((c) => c.id));
      const removed = removeFromAccepted(new Set(alreadyAccepted.map((c) => c.id)));
      for (const id of ids) if (!loadReviewed().has(id)) markReviewed(id, "drop");
      console.log(
        `\n  Dropped ${ids.size} child(ren)` +
          (removed > 0 ? `; removed ${removed} from ${ACCEPTED}.` : "."),
      );
      await sleep(1400);
      return { dropped: ids.size };
    }

    if (key === "n") {
      if (alreadyAccepted.length > 0) {
        console.log(
          `\n  Keeping them. ${alreadyAccepted.length} accepted child(ren) are now ` +
            `ORPHANED — fix with paraphraseOf: null before validating.`,
        );
        await sleep(2200);
      }
      return { dropped: 0 };
    }
  }
}

/**
 * Warn before accepting a paraphrase whose parent is not in the accepted set.
 *
 * The other half of the orphan bug, and the half that actually produced the
 * three that had to be repaired by hand: the parents were dropped FIRST, so no
 * drop-time cascade prompt could have fired — the orphan was created later, at
 * the moment the child was accepted. Guarding only the drop side would leave
 * this path open.
 *
 * Returns the question to accept, or null to cancel.
 */
async function confirmParaphraseParent(question: Question): Promise<Question | null> {
  if (!question.paraphraseOf) return question;

  const acceptedIds = new Set(readJsonl<Question>(ACCEPTED).map((q) => q.id));
  if (acceptedIds.has(question.paraphraseOf)) return question;

  console.clear();
  console.log("═".repeat(80));
  console.log(`  ⚠ ${question.id} POINTS AT A PARENT THAT IS NOT IN THE SET`);
  console.log("═".repeat(80));
  console.log(
    wrap(
      `Its paraphraseOf is "${question.paraphraseOf}", which has not been ` +
        `accepted. Accepting as-is creates an orphan: validation fails, and a ` +
        `paraphrase with no twin measures nothing about phrasing robustness — ` +
        `that comparison is the entire point of the bucket.`,
    ),
  );
  console.log(`\nQUESTION\n${wrap(question.question)}`);

  console.log("\n" + "─".repeat(80));
  console.log("  [f] accept as a standalone factoid  — clears paraphraseOf (recommended)");
  console.log("  [p] accept as a paraphrase anyway   — WILL fail validation");
  console.log("  [c] cancel");
  process.stdout.write("  > ");

  for (;;) {
    const key = process.stdin.isTTY ? await readKey() : await readLineFallback("");
    if (key === "c") return null;
    if (key === "p") return question;
    if (key === "f") {
      return {
        ...question,
        type: "factoid",
        paraphraseOf: null,
        notes: `${question.notes ?? ""} | orphaned paraphrase accepted as factoid`.trim(),
      };
    }
  }
}

async function main(): Promise<void> {
  const candidates = readJsonl<Question>(CANDIDATES);
  if (candidates.length === 0) {
    console.error(
      `No candidates found at ${CANDIDATES}.\nRun: npm run eval:golden`,
    );
    process.exit(1);
  }

  const reviewed = loadReviewed();
  // Clean candidates first, flagged ones last, so the suspect tail can be
  // culled in one pass at the end rather than interrupting the good ones.
  const pending = sortForReview(candidates.filter((q) => !reviewed.has(q.id)));

  if (pending.length === 0) {
    console.log(
      `All ${candidates.length} candidate(s) already reviewed.\n` +
        `Accepted set: ${ACCEPTED}\n` +
        `To start over, delete ${REVIEWED}.`,
    );
    return;
  }

  const corpus = await loadCorpus();
  const chunks = new Map(corpus.map((c) => [c.id, c]));

  let accepted = 0;
  let dropped = 0;
  let skipped = 0;

  for (const [i, question] of pending.entries()) {
    let decided = false;
    let current = question;

    while (!decided) {
      // Unanswerable candidates are judged against a live corpus search, so the
      // screen is drawn twice: once saying it is searching, again with results.
      let probe: Probe[] | { error: string } | null = null;
      if (current.type === "unanswerable") {
        probe = probeCache.get(current.id) ?? null;
        if (probe === null) {
          render(current, chunks, i, pending.length, null);
          probe = await Promise.race([
            probeCorpus(current, chunks),
            sleep(PROBE_TIMEOUT_MS).then(
              () =>
                ({
                  error:
                    `no response in ${PROBE_TIMEOUT_MS / 1000}s ` +
                    `(Voyage free tier is 3 requests/min — it may just be queued)`,
                }) as const,
            ),
          ]);
        }
      }

      render(current, chunks, i, pending.length, probe);

      const key = process.stdin.isTTY ? await readKey() : await readLineFallback("");

      switch (key) {
        case "a": {
          const toAccept = await confirmParaphraseParent(current);
          if (toAccept === null) break;
          accept(toAccept);
          markReviewed(toAccept.id, "accept");
          accepted++;
          decided = true;
          break;
        }
        case "e": {
          const edited = editInEditor(current);
          if (edited) {
            current = edited;
            console.log("\n  Edited. Press [a] to accept the edited version.");
            await sleep(900);
          } else {
            await sleep(1800);
          }
          break;
        }
        case "d": {
          // Dropping a parent orphans its paraphrases: they keep a paraphraseOf
          // pointing at an id that is no longer in the set, which fails
          // validation and silently reweights the paraphrase bucket. Three such
          // orphans were created before this guard existed.
          const cascade = await confirmCascade(current, candidates);
          if (cascade === "cancel") break;

          markReviewed(current.id, "drop");
          dropped++;
          if (cascade.dropped > 0) dropped += cascade.dropped;
          decided = true;
          break;
        }
        case "s":
          // Deliberately NOT recorded — a skip means "decide later".
          skipped++;
          decided = true;
          break;
        case "q":
          summarize(accepted, dropped, skipped, pending.length);
          return;
        default:
          break;
      }
    }
  }

  summarize(accepted, dropped, skipped, pending.length);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function summarize(
  accepted: number,
  dropped: number,
  skipped: number,
  total: number,
): void {
  const decided = accepted + dropped;
  const dropRate = decided === 0 ? 0 : (dropped / decided) * 100;
  const acceptedTotal = readJsonl<Question>(ACCEPTED).length;

  console.clear();
  console.log("\n── Review session ──────────────────────────────────────");
  console.log(`  accepted  ${String(accepted).padStart(3)}`);
  console.log(`  dropped   ${String(dropped).padStart(3)}  (${dropRate.toFixed(0)}% of decided)`);
  console.log(`  skipped   ${String(skipped).padStart(3)}`);
  console.log(`  remaining ${String(total - accepted - dropped - skipped).padStart(3)}`);
  console.log(`\n  ${ACCEPTED} now holds ${acceptedTotal} question(s).`);

  if (decided >= 10 && dropRate < 15) {
    console.log(
      "\n  ⚠ You dropped under 15%. docs/EVAL_HARNESS.md expects 30–40% —\n" +
        "    generated questions that reuse the passage's wording inflate every\n" +
        "    metric. Consider a stricter second pass.",
    );
  }
  console.log("\n  Validate when done:  npm run eval:validate\n");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
