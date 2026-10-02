# ADR: Train a micro LLM for the persona-review pipeline?

- **Status:** Proposed
- **Date:** 2026-10-02
- **Related:** `planning/adr-test-automation.md` (on `docs/test-automation-concept`), the persona-review pipeline (`.github/review-personas/`, `feat/review-poc`), `test/fixtures/`, `src/content.js`
- **Provenance:** drafted by Opus, spot-checked by Sonnet. The counts for extractors (27) and fixtures (21) were re-checked on `origin/dev` on 2026-10-02. Everything marked "unverified" below is unverified.

## Context

The persona-review pipeline (architect, security, devops, SRE, customer, quick-sanitycheck, documentation, testing/QA) is at proof-of-concept stage. It has produced no outputs and no maintainer verdicts yet. Material that could become training or evaluation data today:

- 27 `extract*` functions in `src/content.js`.
- 21 fixtures in `test/fixtures/` (about 88 KB in total, per the Opus draft).
- A large JSDOM suite in `test/run-jsdom.js`, 473 tests including failures in a shallow clone.
- 103 commits visible in a shallow clone (full history unverified), a 350-line `CHANGELOG.md`, a 1,395-line `planning/TODOs.md`.
- PR and issue counts: unverified.

This is enough material to read. It is not labelled data. Labelled examples for the candidate sub-tasks (accept/reject/duplicate, persona routing, DOM-changed triage) currently number **zero**.

## Options considered

**A. Do nothing / no model.** Costs nothing, and we learn nothing.

**B. Existing models with prompts, retrieval and evals.** Persona files, few-shot examples from past accepted findings, retrieval over the repo and past reviews, routing rules, and an off-the-shelf small open-weight model behind the local Hermes setup. Hermes Agent is MIT-licensed and ships no model; it points at whatever endpoint is configured. How the local setup is configured and which weights it runs: unverified.

**C. LoRA/QLoRA fine-tune of a small open-weight model on narrow sub-tasks.**
- Compute is small. QLoRA fine-tuned a 65B model "on a single 48GB GPU", and Guanaco needed "24 hours of finetuning on a single GPU" (Dettmers et al. 2023).
- Estimate (not a benchmark): a 1 to 8B model on about 1k examples takes single-digit to tens of GPU-hours.
- Rental is about $2 to $4 per GPU-hour (Lambda: A100 40GB $1.99, A100 80GB $2.79, H100 $3.99), so tens of dollars per run.
- The real limit is labelled data, not compute. LIMA reached a strong result with "only 1,000 carefully curated prompts and responses", but that was general instruction tuning on a 65B base, so it is only a rough reference.

**D. Pretrain a micro LLM from scratch.**
- GPT-2 124M on 10B tokens: about 90 minutes on 8×A100, "about $20" (Karpathy, llm.c).
- TinyLlama 1.1B at Chinchilla-optimal (22B tokens): "32 hours with 8 A100", about 256 A100-hours, roughly $500 to $700 at Lambda rates.
- TinyLlama 1.1B on 300B tokens: 3,456 A100-hours, roughly $7k to $10k.
- The compute is affordable at the small end. The data is not: this repo is on the order of 1M tokens or less (estimate). A from-scratch model would learn almost everything from generic corpora and would be far weaker than any off-the-shelf model at code review. For one maintainer, D is pointless, not just expensive.

## Decision

**Choose B now. Log data from day one. Do not train anything yet.**

Revisit C only when all of these are true:
1. At least 500 maintainer-labelled findings exist for one specific sub-task (1,000 is better).
2. Prompting plus retrieval with an off-the-shelf small model fails the evaluation bar below for that sub-task.
3. Running that sub-task on Claude or z.ai costs or delays enough to matter. "Matter" needs a number the maintainer picks.
4. The licensing questions below are resolved for that data source.

**Reject D.** Revisit only if the goal changes to a general-purpose model, which is outside Inkpour's scope.

**The Brandenburg datacenter** matters only if C is triggered and runs repeatedly (about weekly). Before that, a few tens of rented GPU-hours a year cost less than any hardware. It is not a dependency.

## Cheapest next step

Every review run records one structured line (the PoC uploads `review-meta.json` as a workflow artifact; a later step can collect these into a private store outside the public repo). Fields:

- `id`, `date`, `commit`, `tag`, `persona`, `backend`, `model`
- `diff_files`, `finding_text`, `severity`, `file_line`
- `maintainer_verdict` (accept / reject / duplicate / wont-fix), `duplicate_of`, `fix_commit`, `minutes_spent`
- A record of every "no findings" run, and whether a bug the review missed turned up later.

This is a small script. It is also the evaluation set and the only future training set.

## Evaluation

- **Eval set:** a frozen holdout of the oldest 100 to 200 labelled findings, stratified by persona and verdict. Never use it for few-shot examples.
- **Precision is weak at that size.** At n=100 the 95% interval on an accuracy of about 80% is roughly ±8 points (normal approximation).
- **Baseline:** Sonnet on the same inputs with the same prompt.
- **Go if all of these hold:**
  - recall on accepted high-severity findings is at least the baseline's, with no misses the baseline caught;
  - accept/reject agreement with the maintainer is within 5 points of baseline;
  - duplicate detection is at least baseline;
  - the cost or latency gain is real and was measured.
- **No-go** if it misses any accepted security finding that Sonnet caught.

## Consequences

- No GPU spend. One logging step.
- Data quality decides whether C is ever possible.
- The decision can be reopened once the triggers are met.

## Risks

- **Anthropic terms.**
  - Commercial terms (API): no use "to build a competing product or service, including to train competing AI models".
  - Consumer terms (Pro/Max, effective 2025-10-08) are broader: no use "to develop or train any artificial intelligence or machine learning algorithms or models".
  - So: if reviews run on a consumer plan, fine-tuning on Claude-generated findings is very likely barred. On the API, a private triage model is arguably non-competing, but that is not settled.
  - Safe path: train only on the maintainer's own labels and text, or get written approval.
- **z.ai terms** (2026-04-14): no use "to develop, train, or enhance any algorithms, models, or technologies that directly or indirectly compete with us". That is broad. The Coding Plan also "may only be used within officially supported tools", and whether a tag-triggered pipeline counts as a supported tool is unverified.
- **AGPL-3.0.** The maintainer can train on his own code freely. For third-party contributions, whether model weights count as a derivative work, and what AGPL then implies for distributing weights or outputs, is legally unsettled (unverified). Keep any fine-tuned weights private and unreleased until checked.
- **Personal data in fixtures.** A grep found no email-like strings, and the fixtures are small. Nothing documents that they were sanitised (unverified). Exclude fixture text from any training set; train on selector-match counts and DOM skeletons from `buildDebugReport()` instead, which drops text by design.
- **Overfitting.** A model trained on a few hundred findings from one person's verdicts on one repo will overfit, and may learn the maintainer's blind spots.

## Open questions

1. Does the pipeline call Claude through the API or a consumer plan?
2. What model and weights licence does the local Hermes setup run?
3. Which sub-task actually costs the maintainer the most time? Start labelling that one.
4. Have the fixtures been reviewed for personal content?

## What is premature

- The pipeline that would produce data is a proof of concept.
- "Train a micro LLM" is two steps ahead of having a single labelled example, and datacenter planning is three steps ahead.
- Several candidate sub-tasks do not need an LLM at all. DOM-changed triage from selector-match counts is a threshold rule or a tiny classifier on numbers. Persona routing is mostly path rules (security for `background.js` and permissions, documentation for `*.md`).
- Build the log, label for three months, then rerun this ADR with real counts.

## Sources

- [Anthropic Commercial Terms](https://www.anthropic.com/legal/commercial-terms)
- [Anthropic Consumer Terms](https://www.anthropic.com/legal/consumer-terms)
- [Z.ai Terms of Use](https://docs.z.ai/legal-agreement/terms-of-use)
- [Z.ai Coding Plan Usage Policy](https://docs.z.ai/devpack/usage-policy)
- [Hermes Agent repo (MIT)](https://github.com/NousResearch/hermes-agent)
- [QLoRA paper](https://arxiv.org/abs/2305.14314)
- [LIMA paper](https://arxiv.org/abs/2305.11206)
- [TinyLlama repo](https://github.com/jzhang38/TinyLlama)
- [llm.c GPT-2 124M reproduction](https://github.com/karpathy/llm.c/discussions/481)
- [Lambda GPU pricing](https://lambda.ai/pricing)
