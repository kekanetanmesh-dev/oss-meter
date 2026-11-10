# oss-meter

**Am I eligible yet?** One command that measures a GitHub account against the thresholds of open-source support programs, starting with [Claude for Open Source](https://claude.com/contact-sales/claude-for-oss).

```
$ npx oss-meter torvalds

Claude for Open Source — torvalds (Linus Torvalds)
Measured 2026-11-10; 12-month window from 2025-11-10

General requirements
  [PASS] GitHub account at least 2 years old: 15.2 years (created 2011-09-04)
  [PASS] Public activity in the last 90 days: 87 events

Qualification tracks (any one)
  [FAIL] Merged PRs into repos you do not own (12 months): 0 / 100
  [PASS] Unique external contributors on one repo (12 months): 61 / 20 — best: torvalds/linux
  [ -- ] Dependents, downloads, criticality score: not measured by this tool
```

Programs like this publish numeric thresholds, but GitHub has no page that shows you *your* numbers for them. Counting "merged PRs into repositories you don't own in the last 12 months" or "unique external contributors with merged PRs" by hand means paging through search results. `oss-meter` does the counting, shows the breakdown per repository, and tells you the date you clear time-based rules.

## Install

```bash
npx oss-meter <login>          # no install
npm i -g oss-meter             # or global
```

Node 20 or newer. Zero dependencies.

Set `GITHUB_TOKEN` (any token with public read access) to lift the unauthenticated search rate limit of 10 requests per minute:

```bash
GITHUB_TOKEN=ghp_... oss-meter <login>
```

## What it measures

| Check | How |
|---|---|
| Account age | `created_at` on the user, compared with the program's minimum. Prints the date you qualify. |
| Recent activity | Public events (pushes, PRs, reviews, releases, issues) inside the program's activity window. |
| Merged PRs into repos you don't own | GitHub search: `is:pr is:merged author:<you> -user:<you> merged:>=<12 months ago>`, with a per-repo breakdown. |
| External contributors on your repos | For each public non-fork repo you own: merged PRs in 12 months, distinct authors, minus you and bots. Reports the best repo. |

Not measured, because GitHub's API does not expose them cleanly: dependent repositories and packages (see the Insights → Dependency graph → Dependents page), registry downloads (npm, PyPI, crates.io), and the [OpenSSF criticality score](https://github.com/ossf/criticality_score). The report says so instead of guessing.

## Exit codes

`0` when the general requirements and at least one measured track pass, `1` when they don't, `2` on bad arguments or API errors. That makes it usable in a scheduled job that nudges you when you cross the line.

## JSON

```bash
oss-meter <login> --json
```

Everything in the report plus the full per-repo arrays. Field names are stable within a major version.

## Programmatic use

```js
import { measure, createClient } from 'oss-meter';

const client = createClient({ token: process.env.GITHUB_TOKEN });
const report = await measure('octocat', { client });
console.log(report.checks);
```

`createClient` accepts a `fetchImpl` so you can test against a fake API, and `measure` accepts `now` for deterministic output.

## Adding another program

Thresholds live in [`src/thresholds.js`](src/thresholds.js) as plain data. If a program you care about publishes numeric criteria, open a PR that adds it there with a link to the source of the numbers.

## Caveats

- GitHub search counts are capped at 1,000 results per query; breakdowns use the first 300 results.
- "External contributor" means the PR author is not the repo owner and does not look like a bot (`[bot]` suffix, `dependabot`, `renovate`, `github-actions`). Organization-owned repos are not scanned yet; see the issues.
- The thresholds are the program's minimums as published. Meeting them does not mean approval; the program's terms say selection is discretionary and that padded or automated activity is discounted.

## Contributing

Issues and PRs welcome. `npm test` runs the suite with Node's built-in test runner; there is nothing to install. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
