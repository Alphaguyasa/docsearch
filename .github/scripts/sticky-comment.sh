#!/usr/bin/env bash
# Post or update ONE pull request comment, identified by a hidden marker.
#
#   sticky-comment.sh <body-file> <marker>
#
# WHY STICKY. A gate that comments on every push turns a ten-commit PR into ten
# near-identical tables, and the reader scrolls to the bottom for the current
# one. Updating a single comment in place means the PR always shows the state of
# its head, and the discussion stays readable.
#
# WHY gh AND NOT AN ACTION. This needs write access to pull request comments.
# A third-party action with that permission is a supply-chain dependency for
# something that is twenty lines of the CLI GitHub already ships.
set -euo pipefail

BODY_FILE="${1:?usage: sticky-comment.sh <body-file> <marker>}"
MARKER="${2:?usage: sticky-comment.sh <body-file> <marker>}"
HIDDEN="<!-- ${MARKER} -->"

if [ ! -f "$BODY_FILE" ]; then
  # The run failed before the gate produced a summary — a crash, a missing
  # baseline, an exhausted quota. Say that, rather than leaving the PR with a
  # stale PASS from the previous push.
  BODY="${HIDDEN}
### ⚠️ Eval gate did not produce a report

The run failed before reaching the gate. See the job log — a crash, a missing
baseline, or an exhausted API quota all land here."
else
  BODY="${HIDDEN}
$(cat "$BODY_FILE")"
fi

PR="${PR_NUMBER:-${GITHUB_REF_NAME%%/*}}"
if [ -z "${PR}" ] || ! [[ "${PR}" =~ ^[0-9]+$ ]]; then
  echo "No pull request number available; skipping comment." >&2
  exit 0
fi

EXISTING=$(gh api "repos/${GITHUB_REPOSITORY}/issues/${PR}/comments" \
  --jq "[.[] | select(.body | contains(\"${HIDDEN}\"))] | .[0].id // empty")

if [ -n "$EXISTING" ]; then
  gh api --method PATCH "repos/${GITHUB_REPOSITORY}/issues/comments/${EXISTING}" \
    -f body="$BODY" >/dev/null
  echo "Updated comment ${EXISTING}."
else
  gh api --method POST "repos/${GITHUB_REPOSITORY}/issues/${PR}/comments" \
    -f body="$BODY" >/dev/null
  echo "Created a new comment."
fi
