#!/usr/bin/env bash
# Prepares a persona review from a tag named review/<persona>/<backend>/<note>.
#
# Reads GITHUB_REF_NAME, validates it, picks the diff base, and writes the diff
# to tmp/diff.patch (tmp/ is gitignored). Writes persona/backend/base/etc. to
# $GITHUB_OUTPUT. Used by .github/workflows/review.yml; also runnable locally:
#
#   GITHUB_REF_NAME=review/quick-sanitycheck/claude/try1 bash .github/scripts/review-prepare.sh
#
# The tag name is attacker-controllable text, so everything parsed from it is
# validated against a strict pattern before it is used anywhere.
set -euo pipefail

TAG="${GITHUB_REF_NAME:?GITHUB_REF_NAME is required}"
OUT="${GITHUB_OUTPUT:-/dev/stdout}"
PERSONAS_DIR=".github/review-personas"
IMPLEMENTED_BACKENDS="claude"        # hermes and zai are planned, not built yet
MAX_DIFF_BYTES="${REVIEW_MAX_DIFF_BYTES:-200000}"

fail() { echo "::error::$*" >&2; exit 1; }

case "$TAG" in
  *snapshot*) fail "review tags must not contain 'snapshot' (would also trigger midnight-snapshot.yml)" ;;
esac

# review/<persona>/<backend>/<note...> ; <note> may contain further slashes
IFS=/ read -r prefix persona backend note <<<"$TAG"
[ "$prefix" = "review" ] || fail "tag must start with review/ (got '$TAG')"
[[ "$persona" =~ ^[a-z][a-z-]{1,31}$ ]] || fail "invalid persona in tag: '$persona'"
[[ "$backend" =~ ^[a-z][a-z0-9-]{1,31}$ ]] || fail "invalid backend in tag: '$backend' (expected review/<persona>/<backend>/<note>)"
[ -f "$PERSONAS_DIR/$persona.md" ] || fail "unknown persona '$persona' (no $PERSONAS_DIR/$persona.md)"

case " $IMPLEMENTED_BACKENDS " in
  *" $backend "*) ;;
  *) fail "backend '$backend' is not implemented in the proof of concept (implemented: $IMPLEMENTED_BACKENDS)" ;;
esac

# Diff base: a commit already contained in dev is compared with main (what the
# next release would ship); anything else is compared with dev (a feature branch).
git rev-parse --verify -q origin/dev  >/dev/null || fail "origin/dev not found (checkout needs fetch-depth: 0)"
git rev-parse --verify -q origin/main >/dev/null || fail "origin/main not found (checkout needs fetch-depth: 0)"
if git merge-base --is-ancestor HEAD origin/dev; then base="origin/main"; else base="origin/dev"; fi

mkdir -p tmp
# Lockfile and saved-page fixtures are noise (and may hold third-party page text);
# the reviewer can still read them as files when it needs to.
git diff --no-color "$base...HEAD" -- . ':(exclude)package-lock.json' ':(exclude)test/fixtures' > tmp/diff.full
full_bytes=$(wc -c < tmp/diff.full | tr -d ' ')
head -c "$MAX_DIFF_BYTES" tmp/diff.full > tmp/diff.patch
rm -f tmp/diff.full

truncated=false; [ "$full_bytes" -gt "$MAX_DIFF_BYTES" ] && truncated=true
empty=false;     [ "$full_bytes" -eq 0 ] && empty=true

{
  echo "persona=$persona"
  echo "backend=$backend"
  echo "base=$base"
  echo "diff_bytes=$full_bytes"
  echo "truncated=$truncated"
  echo "empty=$empty"
} >> "$OUT"

echo "review: persona=$persona backend=$backend base=$base diff_bytes=$full_bytes truncated=$truncated empty=$empty" >&2
