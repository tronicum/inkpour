# Persona reviews

Two ways to trigger one of these personas against a change. Both are proofs of concept.

## 1. Mention: `@claude review:<persona>`

Comment on a pull request (or a PR review comment/review body):

    @claude review:security

`.github/workflows/claude.yml` detects the `review:<persona>` mention, fetches the PR's diff
(`gh pr diff`, capped at 200,000 bytes), and has that persona review it — same personas, same
output format as the tag-based flow below. The result is posted back as Claude's reply on the
thread, same as any other `@claude` mention. An unknown persona name, or an `@claude` mention
with no `review:` syntax at all, falls back to Claude's normal free-form behavior unchanged.

**Turn budget**: each persona has a default `--max-turns` (`detect-persona-mention.sh`), sized to
how much context-reading it typically needs:

| Persona | Default | Persona | Default |
|---|---|---|---|
| `quick-sanitycheck` | 8 | `testing` | 20 |
| `docs` | 15 | `architect` | 20 |
| `customer` | 15 | `sre` | 20 |
| `devops` | 15 | `security` | 25 |

Append `:<N>` to override it for one run, e.g. `@claude review:security:35` — capped at 50
regardless of what's asked for. A request outside 1–50 is ignored with a warning in the run's
log, falling back to the persona's default rather than failing the run.

This needs the Claude GitHub App installed (`claude /install-github-app` from Claude Code, or
install it manually) and the `CLAUDE_CODE_OAUTH_TOKEN` repository secret it sets up — see
"Before the first run" below.

## 2. Tag: `review/<persona>/<backend>/<note>`

A tag matching that pattern starts a review of the commit it points at
(`.github/workflows/review.yml`):

    git tag review/quick-sanitycheck/claude/try1
    git push origin review/quick-sanitycheck/claude/try1

The result appears in the workflow run's job summary, and as artifact `review-<persona>`
(`review.md` plus `review-meta.json`, kept 30 days). Useful for reviewing an arbitrary commit
(not just an open PR) or for a deliberate, maintainer-only review pass — tag creation needs
write access, so this path can't be triggered by an external commenter the way a PR mention can.

## Personas

architect, security, devops, sre, customer, quick-sanitycheck, docs, testing.
Each is one file here; `_common.md` (output format and rules) applies to all of them.
Persona names (in the tag, or after `review:` in a mention) are lowercase and must match a
file name here.

## Backends

| Backend  | Status |
|----------|--------|
| `claude` | Implemented, both flows. Claude Code Action, read-only tools (`Read,Grep,Glob`; the tag flow also allows `Write` for `tmp/review.md`, since there's no PR thread to reply on). |
| `hermes` | Not implemented. Needs a self-hosted runner on the maintainer's machine; never trigger self-hosted runners from pull requests. |
| `zai`    | Not implemented. Check z.ai's terms and supported-tools policy first. |

An unimplemented backend makes the tag-triggered run fail early with a clear message. The
mention flow is `claude`-only for now — there's no `<backend>` segment in the mention syntax.

## Diff base

**Tag flow:** a commit already contained in `dev` is compared with `main`; anything else with
`dev`. `package-lock.json` and `test/fixtures/` are left out of the diff.
**Mention flow:** the PR's diff against its own base branch (`gh pr diff`), no exclusions.
Both cap the diff at 200,000 bytes and say so in the review if it was truncated.

## Before the first run (maintainer)

1. Install the Claude GitHub App on the repository — done via `claude /install-github-app`
   (also generated `.github/workflows/claude.yml`, the mention-flow entry point).
2. The same app install provides the `CLAUDE_CODE_OAUTH_TOKEN` repository secret both flows use.
   To use an API key instead, add `ANTHROPIC_API_KEY` and switch the relevant `with:` input in
   `claude.yml`/`review.yml` to `anthropic_api_key`. The OAuth token is tied to the person who
   generated it; an API key is better for anything long-term.
3. Recommended: a repository ruleset that restricts creating tags matching `review/**` to
   maintainers. The mention flow has **no equivalent restriction** — see Safety notes.

## Delete a trial tag

    git push origin :refs/tags/review/quick-sanitycheck/claude/try1
    git tag -d review/quick-sanitycheck/claude/try1

## Safety notes

**Tag flow:**
- Tag creation needs write access, so only maintainers can trigger a review.
- The diff, commit messages and repository files are untrusted input to the model; every persona is
  told to treat them as data. The model has no shell and no GitHub API access.
- Tags containing `snapshot` are rejected, and `review/**` cannot match `v*`, so a review tag never
  triggers `release.yml` or `midnight-snapshot.yml`.

**Mention flow:**
- `claude.yml`'s job `if:` restricts every `@claude` mention (persona or default) to
  `author_association` of `OWNER`, `MEMBER`, or `COLLABORATOR` — the repo owner and
  collaborators only. `claude /install-github-app`'s own default has no such check (any GitHub
  user could otherwise comment `@claude ...` on a public repo and trigger a real run against the
  installed plan's usage); this repo adds the restriction on top of that default.
- Persona-mode is additionally narrowly scoped (`--allowedTools "Read,Grep,Glob"`, no `Bash`, no
  `Write`), and the diff/comment/commit text is still treated as data, never instructions, same
  as the tag flow.
- `author_association` reflects the commenter's relationship to the repo at comment time, not a
  one-time check — a collaborator who's later removed loses trigger access immediately; it is not
  cached. A fork's PR comments are still evaluated against *this* repo's association, which is
  the correct behavior (a drive-by contributor opening a PR from a fork is not a collaborator).
