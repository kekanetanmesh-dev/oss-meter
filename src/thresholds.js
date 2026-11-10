/**
 * Thresholds from the Claude for Open Source program terms
 * (https://www.anthropic.com/claude-for-oss-terms), checked 2026-11-10.
 * Kept in one place so other programs can be described the same way.
 */
export const CLAUDE_FOR_OSS = {
  name: 'Claude for Open Source',
  url: 'https://claude.com/contact-sales/claude-for-oss',
  general: {
    accountAgeYears: 2,
    activityWindowDays: 90,
  },
  tracks: {
    mergedPrsExternal: { label: 'Merged PRs into repos you do not own (12 months)', min: 100 },
    externalContributors: { label: 'Unique external contributors on one repo (12 months)', min: 20 },
    dependentRepos: { label: 'Dependent repositories (aggregate)', min: 500 },
    dependentPackages: { label: 'Dependent packages (aggregate)', min: 100 },
    monthlyDownloads: { label: 'Monthly package downloads (aggregate)', min: 200_000 },
    criticalityScore: { label: 'OpenSSF criticality score (one repo)', min: 0.4 },
  },
};
