#!/usr/bin/env node
import { pathToFileURL } from 'node:url';
import { measure, createClient, CLAUDE_FOR_OSS } from './index.js';

const HELP = `oss-meter — measure a GitHub account against open-source program thresholds

Usage:
  oss-meter <github-login> [--json] [--max-repos N] [--token TOKEN]

Options:
  --json          Print raw JSON instead of a report
  --max-repos N   Only scan the N most recently updated owned repos (default 100)
  --token TOKEN   GitHub token (or set GITHUB_TOKEN / GH_TOKEN)
  -h, --help      Show this help

Thresholds are from the ${CLAUDE_FOR_OSS.name} program:
  ${CLAUDE_FOR_OSS.url}
Dependents, downloads and criticality score are not measured; check them on
GitHub Insights, your registry and https://github.com/ossf/criticality_score.
`;

export function parseArgs(argv) {
  const opts = { json: false, maxRepos: 100, token: process.env.GITHUB_TOKEN || process.env.GH_TOKEN, login: null, help: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') opts.json = true;
    else if (a === '--max-repos') opts.maxRepos = Number(argv[++i]);
    else if (a === '--token') opts.token = argv[++i];
    else if (a === '-h' || a === '--help') opts.help = true;
    else if (a.startsWith('-')) throw new Error(`Unknown option: ${a}`);
    else if (!opts.login) opts.login = a.replace(/^@/, '');
    else throw new Error(`Unexpected argument: ${a}`);
  }
  return opts;
}

export function formatReport(r) {
  const lines = [];
  const mark = (ok) => (ok ? 'PASS' : 'FAIL');
  lines.push(`${r.program} — ${r.login}${r.name ? ` (${r.name})` : ''}`);
  lines.push(`Measured ${r.measuredAt.slice(0, 10)}; 12-month window from ${r.window.since12m}`);
  lines.push('');
  lines.push('General requirements');
  for (const c of r.checks.filter((c) => c.kind === 'general')) {
    lines.push(`  [${mark(c.pass)}] ${c.label}: ${c.value}${c.note ? ` — ${c.note}` : ''}`);
  }
  lines.push('');
  lines.push('Qualification tracks (any one)');
  for (const c of r.checks.filter((c) => c.kind === 'track')) {
    lines.push(`  [${mark(c.pass)}] ${c.label}: ${c.value} / ${c.min}${c.note ? ` — ${c.note}` : ''}`);
  }
  lines.push('  [ -- ] Dependents, downloads, criticality score: not measured by this tool');
  if (r.prsByRepo.length) {
    lines.push('');
    lines.push('Merged PRs by repository');
    for (const { repo, count } of r.prsByRepo.slice(0, 10)) lines.push(`  ${String(count).padStart(4)}  ${repo}`);
  }
  if (r.contributorsByRepo.length) {
    lines.push('');
    lines.push('External contributors on your repos (12 months)');
    for (const x of r.contributorsByRepo.slice(0, 10)) {
      lines.push(`  ${String(x.externalContributors).padStart(4)}  ${x.repo}  (${x.mergedPrs} merged PRs, ${x.stars} stars)`);
    }
  }
  lines.push('');
  lines.push(r.summary.generalPass && r.summary.anyTrackPass
    ? 'Result: meets the general requirements and at least one track.'
    : 'Result: does not yet meet the measured thresholds. Thresholds are minimums; approval is discretionary.');
  return lines.join('\n');
}

async function main() {
  let opts;
  try {
    opts = parseArgs(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    console.error(HELP);
    process.exit(2);
  }
  if (opts.help || !opts.login) {
    console.log(HELP);
    process.exit(opts.help ? 0 : 2);
  }
  const client = createClient({ token: opts.token });
  try {
    const r = await measure(opts.login, { client, maxRepos: opts.maxRepos });
    if (opts.json) console.log(JSON.stringify(r, null, 2));
    else console.log(formatReport(r));
    process.exit(r.summary.generalPass && r.summary.anyTrackPass ? 0 : 1);
  } catch (e) {
    console.error(`error: ${e.message}`);
    process.exit(2);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
