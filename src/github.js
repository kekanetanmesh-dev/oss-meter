// Minimal GitHub REST client. No dependencies: Node 20+ has global fetch.

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, status, url) {
    super(message);
    this.name = 'GitHubError';
    this.status = status;
    this.url = url;
  }
}

/**
 * Create a client. `fetchImpl` is injectable for tests.
 */
export function createClient({ token, fetchImpl = globalThis.fetch, userAgent = 'oss-meter' } = {}) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': userAgent,
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  async function get(path, params = {}) {
    const url = new URL(path.startsWith('http') ? path : API + path);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    }
    const res = await fetchImpl(url, { headers });
    if (!res.ok) {
      let detail = '';
      try { detail = (await res.json()).message || ''; } catch { /* ignore */ }
      if (res.status === 403 && /rate limit/i.test(detail)) {
        throw new GitHubError('GitHub API rate limit hit. Set GITHUB_TOKEN to raise the limit.', 403, url.href);
      }
      throw new GitHubError(`GitHub API ${res.status} for ${url.pathname}${detail ? `: ${detail}` : ''}`, res.status, url.href);
    }
    return res.json();
  }

  /** Follow `page` params until a page comes back short. Caps at `maxPages`. */
  async function paginate(path, params = {}, { perPage = 100, maxPages = 10, pick = (x) => x } = {}) {
    const out = [];
    for (let page = 1; page <= maxPages; page++) {
      const data = await get(path, { ...params, per_page: perPage, page });
      const items = pick(data);
      out.push(...items);
      if (items.length < perPage) break;
    }
    return out;
  }

  return { get, paginate };
}
