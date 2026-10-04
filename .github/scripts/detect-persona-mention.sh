#!/usr/bin/env bash
# Looks for "@claude review:<persona>" (optionally "@claude review:<persona>:<N>"
# to override the turn budget) in the comment/issue/review body that triggered
# claude.yml, and — when found on a pull request — prepares a diff for that
# persona to review. Mirrors review-prepare.sh's safety posture (strict
# validation of anything parsed from untrusted text, a size-capped diff) but
# is triggered by a mention instead of a maintainer-only tag push.
#
# Env in (set by the workflow step before calling this):
#   EVENT_NAME        github.event_name
#   COMMENT_BODY      the triggering comment/issue/review body text
#   IS_PR             "true" if this event happened on a pull request, else ""
#   PR_NUMBER         the PR number, when IS_PR is "true"
#
# Outputs (via $GITHUB_OUTPUT): persona, max_turns, has_diff, diff_bytes, truncated
set -euo pipefail

OUT="${GITHUB_OUTPUT:-/dev/stdout}"
PERSONAS_DIR=".github/review-personas"
MAX_DIFF_BYTES="${REVIEW_MAX_DIFF_BYTES:-200000}"
MAX_TURNS_CEILING=50   # hard cap regardless of what a commenter asks for

# Per-persona default turn budget. Quick-sanitycheck's own file says "spend at
# most 3 turns" — give it just enough headroom to read _common.md + itself and
# still land well under what a "fast pass" should cost. The deeper personas
# (security, architect, sre) read more of the repo for context (manifest.json,
# multiple source files, AGENTS.md) before they can say anything useful, so
# they get materially more room. Anything not listed falls through to DEFAULT.
default_max_turns() {
  case "$1" in
    quick-sanitycheck) echo 8  ;;
    docs)              echo 15 ;;
    customer)          echo 15 ;;
    devops)            echo 15 ;;
    testing)           echo 20 ;;
    architect)         echo 20 ;;
    sre)               echo 20 ;;
    security)          echo 25 ;;
    *)                 echo 15 ;;  # DEFAULT, for any persona file added later
  esac
}

persona=""
max_turns=""
# Match "@claude review:<persona>" (case-insensitive on the literal words,
# lowercase-only on the persona name — persona file names are lowercase, and
# silently case-folding a typo would be confusing), with an optional
# ":<digits>" suffix to override the turn budget for this one run.
if [[ "${COMMENT_BODY:-}" =~ @claude[[:space:]]+[Rr][Ee][Vv][Ii][Ee][Ww]:([a-z][a-z-]{1,31})(:([0-9]{1,3}))? ]]; then
  candidate="${BASH_REMATCH[1]}"
  override="${BASH_REMATCH[3]:-}"
  if [ -f "$PERSONAS_DIR/$candidate.md" ]; then
    persona="$candidate"
    if [ -n "$override" ]; then
      # Force base-10 (a leading zero, e.g. "008", would otherwise risk being
      # read as octal by some shells/tools) and normalize away the padding.
      override="$((10#$override))"
      if [ "$override" -ge 1 ] && [ "$override" -le "$MAX_TURNS_CEILING" ]; then
        max_turns="$override"
      else
        echo "::warning::requested max-turns override '$override' is out of range (1-$MAX_TURNS_CEILING) — using the $candidate persona's default instead" >&2
      fi
    fi
  else
    echo "::warning::'@claude review:$candidate' mentioned, but no $PERSONAS_DIR/$candidate.md exists — falling back to default @claude behavior" >&2
  fi
fi

[ -n "$persona" ] && [ -z "$max_turns" ] && max_turns="$(default_max_turns "$persona")"

echo "persona=$persona" >> "$OUT"
echo "max_turns=$max_turns" >> "$OUT"

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

echo "detect-persona-mention: persona=${persona:-<none>} max_turns=${max_turns:-<n/a>} has_diff=$has_diff diff_bytes=$diff_bytes truncated=$truncated" >&2
