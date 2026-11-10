import { test } from 'node:test';
import assert from 'node:assert/strict';
import { measure, isBot } from '../src/index.js';
import { formatReport, parseArgs } from '../src/cli.js';

function fakeClient(routes) {
  return {
    async get(path, params = {}) {
      for (const [match, handler] of routes) {
        if (path === match || (match instanceof RegExp && match.test(path))) return handler(params);
      }
      throw new Error(`no route for ${path} ${JSON.stringify(params)}`);
    },
    async paginate(path, params = {}, { pick = (x) => x } = {}) {
      return pick(await this.get(path, { ...params, page: 1 }));
    },
  };
}

const NOW = new Date('2026-11-10T00:00:00Z');

function baseRoutes({ prTotal = 3, created = '2023-01-15T00:00:00Z', events = [] } = {}) {
  return [
    ['/users/alice', () => ({ login: 'alice', name: 'Alice', created_at: created, public_repos: 2, followers: 5 })],
    ['/search/issues', (p) => {
      if (p.q.includes('author:alice')) {
        const items = [
          { repository_url: 'https://api.github.com/repos/org/one', user: { login: 'alice' } },
          { repository_url: 'https://api.github.com/repos/org/one', user: { login: 'alice' } },
          { repository_url: 'https://api.github.com/repos/other/two', user: { login: 'alice' } },
        ];
        return { total_count: prTotal, items };
      }
      if (p.q.includes('repo:alice/lib')) {
        return { total_count: 4, items: [
          { user: { login: 'bob' } }, { user: { login: 'carol' } }, { user: { login: 'alice' } }, { user: { login: 'dependabot[bot]' } },
        ] };
      }
      return { total_count: 0, items: [] };
    }],
    ['/users/alice/repos', () => [
      { full_name: 'alice/lib', fork: false, private: false, stargazers_count: 10 },
      { full_name: 'alice/forked', fork: true, private: false, stargazers_count: 0 },
    ]],
    ['/users/alice/events/public', () => events],
  ];
}

test('isBot filters common bot accounts', () => {
  assert.equal(isBot('dependabot[bot]'), true);
  assert.equal(isBot('renovate-bot'), true);
  assert.equal(isBot('alice'), false);
});

test('measure counts external PRs, external contributors and account age', async () => {
  const client = fakeClient(baseRoutes({ events: [{ type: 'PushEvent', created_at: '2026-11-01T00:00:00Z' }] }));
  const r = await measure('alice', { client, now: NOW });
  assert.equal(r.mergedPrsExternal, 3);
  assert.deepEqual(r.prsByRepo, [{ repo: 'org/one', count: 2 }, { repo: 'other/two', count: 1 }]);
  assert.equal(r.contributorsByRepo.length, 1, 'forks are skipped');
  assert.equal(r.contributorsByRepo[0].externalContributors, 2, 'owner and bots excluded');
  const age = r.checks.find((c) => c.id === 'accountAge');
  assert.equal(age.pass, true);
  const activity = r.checks.find((c) => c.id === 'recentActivity');
  assert.equal(activity.pass, true);
  assert.equal(r.summary.generalPass, true);
  assert.equal(r.summary.anyTrackPass, false);
});

test('young account fails the age check and reports the eligible date', async () => {
  const client = fakeClient(baseRoutes({ created: '2025-10-07T09:11:00Z' }));
  const r = await measure('alice', { client, now: NOW });
  const age = r.checks.find((c) => c.id === 'accountAge');
  assert.equal(age.pass, false);
  assert.equal(r.account.eligibleOn, '2027-10-07');
  assert.match(age.note, /2027-10-07/);
});

test('old activity outside the 90-day window does not count', async () => {
  const client = fakeClient(baseRoutes({ events: [{ type: 'PushEvent', created_at: '2026-01-01T00:00:00Z' }] }));
  const r = await measure('alice', { client, now: NOW });
  assert.equal(r.checks.find((c) => c.id === 'recentActivity').pass, false);
});

test('track passes at the threshold', async () => {
  const client = fakeClient(baseRoutes({ prTotal: 100 }));
  const r = await measure('alice', { client, now: NOW });
  assert.equal(r.checks.find((c) => c.id === 'mergedPrsExternal').pass, true);
  assert.equal(r.summary.anyTrackPass, true);
});

test('formatReport renders PASS/FAIL lines', async () => {
  const client = fakeClient(baseRoutes());
  const r = await measure('alice', { client, now: NOW });
  const out = formatReport(r);
  assert.match(out, /\[PASS\] GitHub account at least 2 years old/);
  assert.match(out, /\[FAIL\] Merged PRs into repos you do not own \(12 months\): 3 \/ 100/);
  assert.match(out, /best: alice\/lib/);
});

test('parseArgs', () => {
  assert.deepEqual(parseArgs(['@alice', '--json', '--max-repos', '5']).login, 'alice');
  assert.equal(parseArgs(['alice', '--json']).json, true);
  assert.equal(parseArgs(['alice', '--max-repos', '5']).maxRepos, 5);
  assert.throws(() => parseArgs(['--nope']), /Unknown option/);
});
