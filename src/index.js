import { createClient } from './github.js';
import { CLAUDE_FOR_OSS } from './thresholds.js';

export { createClient, CLAUDE_FOR_OSS };

const DAY = 24 * 60 * 60 * 1000;

export function isoDate(d) {
  return d.toISOString().slice(0, 10);
}

export function isBot(login) {
  return /\[bot\]$/i.test(login) || /-bot$|^dependabot|^renovate|^github-actions/i.test(login);
}

/**
 * Measure `login`. Returns plain data; formatting lives in cli.js.
 * `now` is injectable for deterministic tests.
 */
export async function measure(login, { client, now = new Date(), maxRepos = 100, program = CLAUDE_FOR_OSS } = {}) {
  const user = await client.get(`/users/${login}`);
  const since12m = isoDate(new Date(now.getTime() - 365 * DAY));
  const since90d = isoDate(new Date(now.getTime() - program.general.activityWindowDays * DAY));

  // Account age
  const created = new Date(user.created_at);
  const ageDays = Math.floor((now.getTime() - created.getTime()) / DAY);
  const eligibleOn = new Date(created);
  eligibleOn.setUTCFullYear(eligibleOn.getUTCFullYear() + program.general.accountAgeYears);

  // Merged PRs authored by the user into repos they do not own, last 12 months.
  const prQuery = `is:pr is:merged author:${login} -user:${login} merged:>=${since12m}`;
  const prSearch = await client.get('/search/issues', { q: prQuery, per_page: 1 });
  const mergedPrsExternal = prSearch.total_count;

  // Breakdown of those PRs by repository (first 300, enough for ranking).
  const prItems = await client.paginate('/search/issues', { q: prQuery, sort: 'updated' }, {
    maxPages: 3,
    pick: (d) => d.items,
  });
  const byRepo = {};
  for (const pr of prItems) {
    const repo = pr.repository_url.replace('https://api.github.com/repos/', '');
    byRepo[repo] = (byRepo[repo] || 0) + 1;
  }
  const prsByRepo = Object.entries(byRepo).sort((a, b) => b[1] - a[1]).map(([repo, count]) => ({ repo, count }));

  // External contributors per owned repo, last 12 months.
  const repos = await client.paginate(`/users/${login}/repos`, { type: 'owner', sort: 'updated' }, {
    maxPages: Math.ceil(maxRepos / 100),
  });
  const ownedPublic = repos.filter((r) => !r.fork && !r.private).slice(0, maxRepos);
  const contributorsByRepo = [];
  for (const r of ownedPublic) {
    const q = `is:pr is:merged repo:${r.full_name} merged:>=${since12m}`;
    const items = await client.paginate('/search/issues', { q }, { maxPages: 5, pick: (d) => d.items });
    const authors = new Set();
    for (const pr of items) {
      const a = pr.user?.login;
      if (a && a.toLowerCase() !== login.toLowerCase() && !isBot(a)) authors.add(a);
    }
    contributorsByRepo.push({ repo: r.full_name, stars: r.stargazers_count, externalContributors: authors.size, mergedPrs: items.length });
  }
  contributorsByRepo.sort((a, b) => b.externalContributors - a.externalContributors);
  const bestRepo = contributorsByRepo[0] || null;

  // Recent public activity: any public event in the activity window.
  const events = await client.paginate(`/users/${login}/events/public`, {}, { maxPages: 3 });
  const cutoff = new Date(since90d).getTime();
  const relevant = new Set(['PushEvent', 'PullRequestEvent', 'PullRequestReviewEvent', 'ReleaseEvent', 'CreateEvent', 'IssuesEvent', 'IssueCommentEvent']);
  const recent = events.filter((e) => relevant.has(e.type) && new Date(e.created_at).getTime() >= cutoff);
  const lastActivity = events.length ? events[0].created_at : null;

  const t = program.tracks;
  const checks = [
    {
      id: 'accountAge',
      label: `GitHub account at least ${program.general.accountAgeYears} years old`,
      value: `${(ageDays / 365).toFixed(1)} years (created ${isoDate(created)})`,
      pass: ageDays >= program.general.accountAgeYears * 365,
      note: ageDays >= program.general.accountAgeYears * 365 ? '' : `qualifies on ${isoDate(eligibleOn)}`,
      kind: 'general',
    },
    {
      id: 'recentActivity',
      label: `Public activity in the last ${program.general.activityWindowDays} days`,
      value: recent.length ? `${recent.length} events` : lastActivity ? `none (last seen ${isoDate(new Date(lastActivity))})` : 'none',
      pass: recent.length > 0,
      kind: 'general',
    },
    {
      id: 'mergedPrsExternal',
      label: t.mergedPrsExternal.label,
      value: mergedPrsExternal,
      min: t.mergedPrsExternal.min,
      pass: mergedPrsExternal >= t.mergedPrsExternal.min,
      kind: 'track',
    },
    {
      id: 'externalContributors',
      label: t.externalContributors.label,
      value: bestRepo ? bestRepo.externalContributors : 0,
      min: t.externalContributors.min,
      pass: !!bestRepo && bestRepo.externalContributors >= t.externalContributors.min,
      note: bestRepo ? `best: ${bestRepo.repo}` : 'no public repos',
      kind: 'track',
    },
  ];

  return {
    program: program.name,
    login: user.login,
    name: user.name,
    measuredAt: now.toISOString(),
    window: { since12m, since90d },
    account: { createdAt: user.created_at, ageDays, eligibleOn: isoDate(eligibleOn), publicRepos: user.public_repos, followers: user.followers },
    mergedPrsExternal,
    prsByRepo,
    contributorsByRepo,
    recentActivityEvents: recent.length,
    checks,
    notMeasured: ['dependentRepos', 'dependentPackages', 'monthlyDownloads', 'criticalityScore'],
    summary: {
      generalPass: checks.filter((c) => c.kind === 'general').every((c) => c.pass),
      anyTrackPass: checks.filter((c) => c.kind === 'track').some((c) => c.pass),
    },
  };
}
