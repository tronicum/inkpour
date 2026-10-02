# Persona reviews

A tag named `review/<persona>/<backend>/<note>` starts a review of the commit it points at
(`.github/workflows/review.yml`). This is a proof of concept.

    git tag review/quick-sanitycheck/claude/try1
    git push origin review/quick-sanitycheck/claude/try1

The result appears in the workflow run's job summary, and as artifact `review-<persona>`
(`review.md` plus `review-meta.json`, kept 30 days).

## Personas

architect, security, devops, sre, customer, quick-sanitycheck, docs, testing.
Each is one file here; `_common.md` (output format and rules) applies to all of them.
Persona names in the tag are lowercase and must match a file name.

## Backends

| Backend  | Status |
|----------|--------|
| `claude` | Implemented. Claude Code Action with `claude-sonnet-5-5`, read-only tools plus Write for `tmp/review.md`. |
| `hermes` | Not implemented. Needs a self-hosted runner on the maintainer's machine; never trigger self-hosted runners from pull requests. |
| `zai`    | Not implemented. Check z.ai's terms and supported-tools policy first. |

An unimplemented backend makes the run fail early with a clear message.

## Diff base

A commit already contained in `dev` is compared with `main`; anything else with `dev`.
`package-lock.json` and `test/fixtures/` are left out of the diff; the diff is capped at 200,000 bytes.

## Before the first run (maintainer)

1. Install the Claude GitHub App on the repository.
2. Add the repository secret `CLAUDE_CODE_OAUTH_TOKEN` (from `claude setup-token`), or switch the
   input in `review.yml` to `anthropic_api_key` and add `ANTHROPIC_API_KEY`. The OAuth token is tied
   to the person who generated it; an API key is better for anything long-term.
3. Recommended: a repository ruleset that restricts creating tags matching `review/**` to maintainers.
4. Watch the first run. Unverified: that the action accepts a tag push event, and that the
   `--allowedTools` list is enough for it to read the diff and write `tmp/review.md`.

## Delete a trial tag

    git push origin :refs/tags/review/quick-sanitycheck/claude/try1
    git tag -d review/quick-sanitycheck/claude/try1

## Safety notes

- Tag creation needs write access, so only maintainers can trigger a review.
- The diff, commit messages and repository files are untrusted input to the model; every persona is
  told to treat them as data. The model has no shell and no GitHub API access.
- Tags containing `snapshot` are rejected, and `review/**` cannot match `v*`, so a review tag never
  triggers `release.yml` or `midnight-snapshot.yml`.
