# Contributing

Thanks for looking. This is a small tool and small PRs are welcome.

## Setup

```bash
git clone https://github.com/kekanetanmesh-dev/oss-meter
cd oss-meter
npm test
```

No dependencies, no build step. Tests use `node:test` and a fake GitHub client, so they run offline.

## Good first contributions

- Support organization-owned repos (`/orgs/:org/repos`) when the user is a member.
- Add another program's thresholds to `src/thresholds.js` with a source link.
- Count reviews as activity in the 90-day check.
- A `--since` flag to move the 12-month window.

## Rules

- Keep it zero-dependency.
- Every threshold must cite where the number comes from.
- Add a test for behaviour you change. Run `npm test` before pushing.
