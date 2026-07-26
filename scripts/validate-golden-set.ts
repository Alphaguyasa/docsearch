/**
 * Golden set validation — Phase 1 of docs/EVAL_HARNESS.md.
 *
 *   npm run eval:validate [-- --file eval/golden/questions.jsonl]
 *   npm run eval:validate -- --duplicates [--similarity 0.85] [--delay 20000]
 *
 * Fails loudly (exit 1) if any of these hold:
 *   - an id is duplicated
 *   - a relevantChunkIds entry does not exist in the database
 *   - an answerable question has an empty relevantChunkIds
 *   - an unanswerable question has a non-null expectedAnswer
 *   - the type distribution deviates more than 25% from the composition table
 *
 * --duplicates additionally scans for RELEVANT-BUT-UNLABELLED chunks: chunks the
 * retriever surfaces that closely match a labelled chunk but are not themselves
 * labelled. Those are false negatives in the ground truth — a retriever that
 * returns them is scored wrong, so recall understates the system. Advisory, and
 * opt-in because it spends embedding quota; question embeddings are cached, so
 * re-running after adding labels is free for unchanged questions.
 *
 * Every check exists because violating it silently corrupts a metric rather than
 * crashing: a dangling chunk id makes recall unscoreable, an unanswerable
 * question with an answer inverts the refusal metric, and a skewed distribution
 * makes the headline number a statement about whichever bucket dominates.
 */
import "../src/lib/loadenv";

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { fetchByIds } from "../src/lib/paginate";

import { cached } from "../eval/src/cache";
import { existingChunkIds } from "../eval/src/corpus";
import { loadGoldenSet, warnHoldout } from "../eval/src/goldenset";
import {
  findUnlabelledNearDuplicates,
  parseVector,
  percentile,
  type CandidateChunk,
  type LabelledChunk,
  type NearDuplicate,
} from "../eval/src/duplicates";
import type { MultihopKind, Question, QuestionType } from "../eval/src/types";

const UNLABELLED_FILE = "eval/golden/unlabelled-candidates.jsonl";

/** Candidate pool depth per question. */
const RETRIEVAL_DEPTH = 50;

/**
 * Chunk-to-chunk cosine above which an unlabelled chunk is worth reviewing.
 *
 * Provisional. Adjacent chunks from one document share the 15% overlap window
 * and will score high by construction, so the useful threshold depends on the
 * corpus — tune it from the percentiles this prints.
 */
const DEFAULT_SIMILARITY = 0.85;

/**
 * Composition table from docs/EVAL_HARNESS.md, as percentages.
 *
 * RETARGETED FROM MEASUREMENT, not from preference. The original table asked for
 * 35% factoid / 20% multi-hop. Multi-hop cannot reach 20% on this corpus:
 * cross-document pairs yielded 2 questions from 33 generation attempts, and 0 of
 * 33 survived review. Multi-hop is set to what the corpus actually supports and
 * factoid absorbs the difference, because factoid is the bucket the corpus
 * supplies without limit. See the deviation note in docs/EVAL_HARNESS.md.
 *
 * Sums to 100 so the generator's `want()` split adds up to --target.
 */
const TARGET_MIX: Record<QuestionType, number> = {
  factoid: 47,
  multihop: 8,
  aggregation: 10,
  unanswerable: 20,
  paraphrase: 15,
};

/**
 * Valid values for `multihopKind`.
 *
 * THERE IS NO ENFORCED SPLIT between the two. An earlier version required 40%
 * cross-document, which the corpus cannot supply at any attempt count: 33
 * generation attempts produced 2 candidates and review kept 0. A target nobody
 * can hit is not a standard, it is a permanently red check that teaches
 * reviewers to ignore the validator.
 *
 * The FIELD stays, and the breakdown is still printed, because the distinction
 * is real and reporting it is the honest thing to do — a same-document question
 * can often be answered from one well-chosen chunk, so it tests multi-chunk
 * assembly less severely. It is reported, not required.
 */
const VALID_MULTIHOP_KINDS = new Set<MultihopKind>(["cross-doc", "same-doc"]);

/** Relative tolerance on each bucket's share, per the spec. */
const TOLERANCE = 0.25;

const VALID_TYPES = new Set<string>(Object.keys(TARGET_MIX));
const VALID_DIFFICULTIES = new Set(["easy", "medium", "hard"]);

interface Args {
  file: string | undefined;
  holdout: boolean;
  skipDb: boolean;
  duplicates: boolean;
  similarity: number;
  delayMs: number;
}

function parseArgs(argv: string[]): Args {
  const args: Args = {
    // Undefined means "let loadGoldenSet decide", which defaults to DEV.
    file: undefined,
    holdout: false,
    skipDb: false,
    duplicates: false,
    similarity: DEFAULT_SIMILARITY,
    delayMs: 0,
  };

  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    if (flag === "--skip-db") {
      args.skipDb = true;
    } else if (flag === "--holdout") {
      args.holdout = true;
    } else if (flag === "--duplicates") {
      args.duplicates = true;
    } else {
      const value = argv[++i];
      if (!value || value.startsWith("--")) throw new Error(`${flag} requires a value`);
      if (flag === "--file") args.file = value;
      else if (flag === "--similarity") {
        args.similarity = Number(value);
        if (!Number.isFinite(args.similarity) || args.similarity <= 0 || args.similarity > 1) {
          throw new Error("--similarity must be between 0 and 1");
        }
      } else if (flag === "--delay") {
        args.delayMs = Number(value);
        if (!Number.isFinite(args.delayMs) || args.delayMs < 0) {
          throw new Error("--delay must be a non-negative number of milliseconds");
        }
      } else {
        throw new Error(`Unknown argument: ${flag}`);
      }
    }
  }
  return args;
}

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

interface MatchRow {
  id: string;
  document_id: string;
  content: string;
  page_number: number | null;
  similarity: number;
}

/**
 * Scan for relevant-but-unlabelled chunks.
 *
 * Question embeddings go through the disk cache, so re-running after adding
 * labels costs no Voyage quota for questions that have not changed.
 */
async function scanForUnlabelled(
  questions: Question[],
  args: Args,
): Promise<{
  rows: UnlabelledRow[];
  questionsAffected: number;
  similarities: number[];
  skipped: number;
  questionsFullySkipped: string[];
}> {
  // Imported lazily so --skip-db and the pure checks need no credentials.
  const { db } = await import("../src/lib/db");
  const { embedQuery } = await import("../src/lib/embed");

  const answerable = questions.filter((q) => q.type !== "unanswerable");
  const rows: UnlabelledRow[] = [];
  const allSimilarities: number[] = [];
  let questionsAffected = 0;
  let skipped = 0;
  const questionsFullySkipped: string[] = [];

  for (const [i, question] of answerable.entries()) {
    process.stdout.write(`\r  scanning ${i + 1}/${answerable.length}...`);

    const embedding = await cached(
      "question-embedding",
      { model: "voyage-4", inputType: "query", text: question.question },
      () => embedQuery(question.question),
    );

    const match = await db.rpc("match_chunks", {
      query_embedding: JSON.stringify(embedding),
      match_count: RETRIEVAL_DEPTH,
    });
    if (match.error) throw new Error(`retrieval failed: ${match.error.message}`);
    const retrieved = (match.data ?? []) as MatchRow[];

    const candidates: CandidateChunk[] = retrieved.map((r, rank) => ({
      chunkId: r.id,
      docId: r.document_id,
      page: r.page_number,
      text: r.content,
      rank: rank + 1,
    }));

    // Embeddings for the labelled chunks and every candidate. Batched rather
    // than one `.in()`: a question with a large relevantChunkIds list would
    // otherwise silently lose rows at the 1000-row cap, and a missing embedding
    // reads as "could not compare" rather than as the read bug it is.
    const wanted = [...new Set([...question.relevantChunkIds, ...candidates.map((c) => c.chunkId)])];
    const vectorRows = await fetchByIds<{
      id: string;
      document_id: string;
      embedding: unknown;
    }>("chunk embeddings", wanted, (batch) =>
      db
        .from("chunks")
        .select("id,document_id,embedding")
        .in("id", batch)
        .returns<{ id: string; document_id: string; embedding: unknown }[]>(),
    );

    const embeddings = new Map<string, number[]>();
    const docOf = new Map<string, string>();
    for (const row of vectorRows) {
      const vector = parseVector(row.embedding);
      if (vector) embeddings.set(row.id, vector);
      docOf.set(row.id, row.document_id);
    }

    const labelled: LabelledChunk[] = question.relevantChunkIds.map((id) => ({
      chunkId: id,
      docId: docOf.get(id) ?? "(unknown)",
    }));

    const scan = findUnlabelledNearDuplicates(labelled, candidates, embeddings, args.similarity);
    allSimilarities.push(...scan.similarities);
    skipped += scan.skipped;

    // A question whose candidates were ALL skipped was never actually checked.
    // Counting it as clean would report ground truth as verified when nothing
    // was compared — the exact failure the pure function refuses to hide.
    if (scan.similarities.length === 0 && scan.skipped > 0) {
      questionsFullySkipped.push(question.id);
    }

    if (scan.flagged.length > 0) {
      questionsAffected++;
      for (const flag of scan.flagged) {
        rows.push(toRow(question, flag, embeddings, docOf));
      }
    }

    if (args.delayMs) await sleep(args.delayMs);
  }

  process.stdout.write(`\r  scanned ${answerable.length} answerable question(s).        \n`);
  return {
    rows,
    questionsAffected,
    similarities: allSimilarities,
    skipped,
    questionsFullySkipped,
  };
}

/** One reviewable row: the question, the chunk already labelled, the candidate. */
interface UnlabelledRow {
  questionId: string;
  question: string;
  questionType: string;
  labelled: { chunkId: string; docId: string };
  candidate: {
    chunkId: string;
    docId: string;
    page: number | null;
    text: string;
    retrievalRank: number;
  };
  similarity: number;
  sameDocument: boolean;
  /** Filled in by you during review: "add" or "reject". */
  decision: null;
}

function toRow(
  question: Question,
  flag: NearDuplicate,
  _embeddings: Map<string, number[]>,
  docOf: Map<string, string>,
): UnlabelledRow {
  return {
    questionId: question.id,
    question: question.question,
    questionType: question.type,
    labelled: {
      chunkId: flag.labelledChunkId,
      docId: docOf.get(flag.labelledChunkId) ?? "(unknown)",
    },
    candidate: {
      chunkId: flag.candidate.chunkId,
      docId: flag.candidate.docId,
      page: flag.candidate.page,
      text: flag.candidate.text,
      retrievalRank: flag.candidate.rank,
    },
    similarity: Number(flag.similarity.toFixed(4)),
    sameDocument: flag.sameDocument,
    decision: null,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { skipDb } = args;

  // Defaults to the DEV split; the holdout needs --holdout, explicitly.
  const loaded = loadGoldenSet({ holdout: args.holdout, file: args.file });
  warnHoldout(loaded);

  const file = loaded.file;
  const questions = loaded.questions;
  const errors: string[] = [];

  if (questions.length === 0) {
    throw new Error(`${file} contains no parseable questions.`);
  }

  // --- Per-question invariants ---------------------------------------------
  const seen = new Set<string>();
  for (const q of questions) {
    const where = q.id ?? "(missing id)";

    if (!q.id) errors.push(`${where}: missing id`);
    else if (seen.has(q.id)) errors.push(`${q.id}: duplicate id`);
    else seen.add(q.id);

    if (!q.question?.trim()) errors.push(`${where}: empty question text`);
    if (!VALID_TYPES.has(q.type)) errors.push(`${where}: invalid type "${q.type}"`);
    if (!VALID_DIFFICULTIES.has(q.difficulty)) {
      errors.push(`${where}: invalid difficulty "${q.difficulty}"`);
    }

    if (q.type === "unanswerable") {
      if (q.expectedAnswer !== null) {
        errors.push(
          `${where}: unanswerable question has a non-null expectedAnswer ` +
            `(${JSON.stringify(q.expectedAnswer)?.slice(0, 60)})`,
        );
      }
      if (q.relevantChunkIds.length > 0) {
        errors.push(`${where}: unanswerable question lists relevantChunkIds`);
      }
    } else {
      if (!Array.isArray(q.relevantChunkIds) || q.relevantChunkIds.length === 0) {
        errors.push(`${where}: answerable question has empty relevantChunkIds`);
      }
      if (!Array.isArray(q.relevantDocIds) || q.relevantDocIds.length === 0) {
        errors.push(`${where}: answerable question has empty relevantDocIds`);
      }
    }

    // multihopKind must be present on multihop questions and absent elsewhere.
    // An unlabelled multihop question silently drops out of the Phase 6
    // breakdown, which is the only place the cross/same distinction is visible.
    if (q.type === "multihop") {
      if (!q.multihopKind) {
        errors.push(
          `${where}: multihop question has no multihopKind ` +
            `(expected one of ${[...VALID_MULTIHOP_KINDS].join(", ")})`,
        );
      } else if (!VALID_MULTIHOP_KINDS.has(q.multihopKind)) {
        errors.push(`${where}: invalid multihopKind "${q.multihopKind}"`);
      }
    } else if (q.multihopKind) {
      errors.push(
        `${where}: multihopKind "${q.multihopKind}" set on a ${q.type} question`,
      );
    }

    if (q.type === "paraphrase" && !q.paraphraseOf) {
      errors.push(`${where}: paraphrase question has no paraphraseOf`);
    }
    if (q.paraphraseOf && !questions.some((other) => other.id === q.paraphraseOf)) {
      errors.push(`${where}: paraphraseOf "${q.paraphraseOf}" does not exist in this set`);
    }
  }

  // --- Chunk ids must resolve against the live database --------------------
  if (skipDb) {
    console.log("Skipping database chunk-id check (--skip-db).");
  } else {
    const referenced = questions.flatMap((q) => q.relevantChunkIds);
    const found = await existingChunkIds(referenced);
    for (const q of questions) {
      for (const id of q.relevantChunkIds) {
        if (!found.has(id)) {
          errors.push(`${q.id}: relevantChunkIds entry "${id}" does not exist in the DB`);
        }
      }
    }
  }

  // --- Type distribution ---------------------------------------------------
  const counts = questions.reduce<Record<string, number>>((acc, q) => {
    acc[q.type] = (acc[q.type] ?? 0) + 1;
    return acc;
  }, {});

  const distributionRows: string[] = [];
  for (const type of Object.keys(TARGET_MIX) as QuestionType[]) {
    const actualPct = ((counts[type] ?? 0) / questions.length) * 100;
    const targetPct = TARGET_MIX[type];
    const deviation = Math.abs(actualPct - targetPct) / targetPct;
    const ok = deviation <= TOLERANCE;

    distributionRows.push(
      `  ${type.padEnd(13)} ${String(counts[type] ?? 0).padStart(3)}  ` +
        `${actualPct.toFixed(1).padStart(5)}%  target ${String(targetPct).padStart(2)}%  ` +
        `dev ${(deviation * 100).toFixed(0).padStart(3)}%  ` +
        `${loaded.isHoldout ? "n/a" : ok ? "ok" : "OUT OF RANGE"}`,
    );

    // The holdout is deliberately NOT representative — it draws only from
    // factoid/unanswerable/paraphrase, so multihop and aggregation are 0% by
    // design. Enforcing the composition table against it would fail every time
    // and mean nothing. The per-question invariants above still apply.
    if (!ok && !loaded.isHoldout) {
      errors.push(
        `distribution: ${type} is ${actualPct.toFixed(1)}% of the set but the ` +
          `table targets ${targetPct}% — ${(deviation * 100).toFixed(0)}% deviation ` +
          `exceeds the ${TOLERANCE * 100}% tolerance`,
      );
    }
  }

  // --- Multi-hop split (REPORTED, never enforced — see VALID_MULTIHOP_KINDS) -
  const multihop = questions.filter((q) => q.type === "multihop");
  const multihopRows: string[] = [];

  if (multihop.length > 0) {
    for (const kind of VALID_MULTIHOP_KINDS) {
      const n = multihop.filter((q) => q.multihopKind === kind).length;
      const actualPct = (n / multihop.length) * 100;
      multihopRows.push(
        `  ${kind.padEnd(13)} ${String(n).padStart(3)}  ${actualPct.toFixed(1).padStart(5)}%`,
      );
    }
  }

  // --- Report --------------------------------------------------------------
  console.log(`\nValidating ${file} — ${questions.length} question(s)\n`);
  console.log(
    loaded.isHoldout
      ? "── Type distribution (reported only — holdout is not representative) ──"
      : "── Type distribution ───────────────────────────────────",
  );
  for (const row of distributionRows) console.log(row);

  if (multihopRows.length > 0) {
    console.log(
      `\n── Multi-hop split (of ${multihop.length}) — reported, not enforced ──`,
    );
    for (const row of multihopRows) console.log(row);
    if (multihop.length < 10) {
      console.log(
        `  n=${multihop.length} is too small to support a per-kind conclusion; ` +
          `read it as provenance, not as a metric.`,
      );
    }
  }

  // --- Unlabelled near-duplicates (opt-in: costs embedding quota) ----------
  if (args.duplicates && !skipDb) {
    console.log(
      `\n── Unlabelled near-duplicates ──────────────────────────\n` +
        `  top ${RETRIEVAL_DEPTH} per question, flagging chunk-to-chunk cosine >= ${args.similarity}\n`,
    );
    const scan = await scanForUnlabelled(questions, args);

    if (scan.similarities.length > 0) {
      console.log(
        `\n  similarity distribution (unlabelled candidates vs nearest labelled chunk)\n` +
          `    p50 ${percentile(scan.similarities, 0.5).toFixed(3)}   ` +
          `p90 ${percentile(scan.similarities, 0.9).toFixed(3)}   ` +
          `p99 ${percentile(scan.similarities, 0.99).toFixed(3)}   ` +
          `max ${Math.max(...scan.similarities).toFixed(3)}`,
      );
    }

    const answerable = questions.filter((q) => q.type !== "unanswerable").length;
    console.log(
      `\n  questions with unlabelled near-duplicates: ` +
        `${scan.questionsAffected} of ${answerable} answerable`,
    );
    console.log(`  candidate chunks flagged:                  ${scan.rows.length}`);

    // Surfaced, not swallowed: a skipped candidate is one that was never
    // compared. Reporting only the flagged count would let a scan that compared
    // nothing look identical to a scan that found nothing.
    if (scan.skipped > 0) {
      console.log(
        `\n  ⚠ ${scan.skipped} candidate(s) could not be compared — missing or\n` +
          `    malformed embedding, or a dimension mismatch (two embedding models\n` +
          `    mixed in one table). These were NOT checked either way.`,
      );
    }
    if (scan.questionsFullySkipped.length > 0) {
      console.log(
        `\n  ⚠ ${scan.questionsFullySkipped.length} question(s) had NO comparable ` +
          `candidate at all —\n    the duplicate check did not run for them: ` +
          `${scan.questionsFullySkipped.slice(0, 5).join(", ")}` +
          (scan.questionsFullySkipped.length > 5 ? ", ..." : ""),
      );
    }

    if (scan.rows.length > 0) {
      const sameDoc = scan.rows.filter((r) => r.sameDocument).length;
      console.log(
        `    ${sameDoc} from the SAME document as the labelled chunk ` +
          `(usually an adjacent overlapping chunk)\n` +
          `    ${scan.rows.length - sameDoc} from a DIFFERENT document ` +
          `(duplicated or boilerplate content)`,
      );

      mkdirSync(path.dirname(UNLABELLED_FILE), { recursive: true });
      writeFileSync(
        UNLABELLED_FILE,
        scan.rows.map((r) => JSON.stringify(r)).join("\n") + "\n",
      );
      console.log(
        `\n  Wrote ${UNLABELLED_FILE}\n` +
          `  Review each: add the candidate to that question's relevantChunkIds,\n` +
          `  or reject it. Left unlabelled, a retriever that returns these is\n` +
          `  scored WRONG and recall understates the system.`,
      );
    } else if (scan.similarities.length > 0) {
      console.log("\n  ✓ No unlabelled near-duplicates above the threshold.");
    } else {
      console.log(
        "\n  ! Nothing was compared — no clean bill of health can be given here.",
      );
    }

    // Advisory — a false negative in the ground truth is not a validation
    // failure, and blocking on it would stop you shipping a usable golden set.
    console.log("\n  (advisory — does not affect the pass/fail below)");
  } else if (args.duplicates && skipDb) {
    console.log("\n  Skipping duplicate scan — --skip-db was passed.");
  }

  if (errors.length > 0) {
    console.error(`\n── FAILED: ${errors.length} problem(s) ────────────────────────`);
    for (const error of errors) console.error(`  ✗ ${error}`);
    console.error("");
    // Set the code and return rather than process.exit(): tearing the process
    // down while the Supabase client still holds open handles trips a libuv
    // assertion on Windows and reports 127 instead of 1, which would make the
    // Phase 7/9 gate unreadable.
    process.exitCode = 1;
    return;
  }

  console.log(`\n✓ Golden set is valid (${questions.length} questions).\n`);
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
