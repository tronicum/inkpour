/**
 * Self-hosted Renovate config for the manual "check for npm updates" workflow
 * (.github/workflows/renovate.yml). Not the same as a repo's renovate.json —
 * this is the "global" config passed via `configurationFile` to
 * renovatebot/github-action, which is why it explicitly lists `repositories`
 * and disables onboarding (no repo-facing renovate.json required).
 */
module.exports = {
  platform: 'github',
  repositories: ['tronicum/inkpour'],

  // Single-config-file mode: skip the onboarding PR and don't require a
  // repo-level renovate.json — this file is the only config that matters.
  onboarding: false,
  requireConfig: 'optional',

  // Distinct prefix so this doesn't collide with the official Renovate
  // GitHub App if that's ever installed on the repo too.
  branchPrefix: 'renovate-manual/',

  // Only scan package.json/npm — keeps the required PAT scope to plain
  // "repo", since the github-actions manager needs a broader "workflow"
  // scope token to update workflow files.
  enabledManagers: ['npm'],

  dependencyDashboard: true,
};
