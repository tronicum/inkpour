#!/usr/bin/env bash
# Looks for "@claude review:<persona>" in the comment/issue/review body that
# triggered claude.yml, and — when found on a pull request — prepares a diff
# for that persona to review. Mirrors review-prepare.sh's safety posture
# (strict validation of anything parsed from untrusted text, a size-capped
# diff) but is triggered by a mention instead of a maintainer-only tag push.
#
# Env in (set by the workflow step before calling this):
#   EVENT_NAME        github.event_name
#   COMMENT_BODY      the triggering comment/issue/review body text
#   IS_PR             "true" if this event happened on a pull request, else ""
#   PR_NUMBER         the PR number, when IS_PR is "true"
#
# Outputs (via $GITHUB_OUTPUT): persona, has_diff, diff_bytes, truncated
set -euo pipefail

OUT="${GITHUB_OUTPUT:-/dev/stdout}"
PERSONAS_DIR=".github/review-personas"
MAX_DIFF_BYTES="${REVIEW_MAX_DIFF_BYTES:-200000}"

persona=""
# Match "@claude review:<persona>" case-insensitively on the literal words,
# case-sensitively (lowercase-only) on the persona name itself — persona file
# names are lowercase, and silently case-folding a typo would be confusing.
if [[ "${COMMENT_BODY:-}" =~ @claude[[:space:]]+[Rr][Ee][Vv][Ii][Ee][Ww]:([a-z][a-z-]{1,31}) ]]; then
  candidate="${BASH_REMATCH[1]}"
  if [ -f "$PERSONAS_DIR/$candidate.md" ]; then
    persona="$candidate"
  else
    echo "::warning::'@claude review:$candidate' mentioned, but no $PERSONAS_DIR/$candidate.md exists — falling back to default @claude behavior" >&2
  fi
fi

echo "persona=$persona" >> "$OUT"

has_diff=false
diff_bytes=0
truncated=false

if [ -n "$persona" ] && [ "${IS_PR:-}" = "true" ] && [ -n "${PR_NUMBER:-}" ]; then
  mkdir -p tmp
  # gh pr diff needs GH_TOKEN in the environment (set by the calling step).
  gh pr diff "$PR_NUMBER" --color=never > tmp/diff.full
  diff_bytes=$(wc -c < tmp/diff.full | tr -d ' ')
  head -c "$MAX_DIFF_BYTES" tmp/diff.full > tmp/diff.patch
  rm -f tmp/diff.full
  [ "$diff_bytes" -gt "$MAX_DIFF_BYTES" ] && truncated=true
  [ "$diff_bytes" -gt 0 ] && has_diff=true
fi

{
  echo "has_diff=$has_diff"
  echo "diff_bytes=$diff_bytes"
  echo "truncated=$truncated"
} >> "$OUT"

echo "detect-persona-mention: persona=${persona:-<none>} has_diff=$has_diff diff_bytes=$diff_bytes truncated=$truncated" >&2
