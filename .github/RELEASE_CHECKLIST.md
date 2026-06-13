# Release Checklist

Use this checklist before publishing a public GitHub release.

## Before Tagging

- [ ] Confirm `package.json` has the intended version.
- [ ] Update `CHANGELOG.md` with user-facing changes.
- [ ] Run `npm ci` from a clean checkout if possible.
- [ ] Run `npm run typecheck`.
- [ ] Run `npm run lint`.
- [ ] Run `npm run test`.
- [ ] Run `npm run build`.
- [ ] Run `npm run release:audit`.
- [ ] Confirm `doc/` and `doc-prd/` are not tracked.
- [ ] Confirm `dist/`, logs, local caches, generated videos, and private deployment config are not tracked.
- [ ] Confirm the release does not include login, VIP, payment, cloud sync, or private backend logic.
- [ ] Confirm screenshots, fonts, examples, and bundled assets have documented redistribution rights.

## Tagging

```bash
git tag -a v0.1.0 -m "v0.1.0 Community Edition"
git push origin v0.1.0
```

## GitHub Release Notes

Suggested structure:

- What is included in the Community Edition.
- What is intentionally out of scope.
- How to run locally.
- Known limitations.
- How to report bugs or contribute.

## After Publishing

- [ ] Open Issues and confirm templates render correctly.
- [ ] Confirm CI passes on the public repository.
- [ ] Pin or link the demo project and screenshot from the README.
- [ ] Share the release announcement only after the repository contents have been reviewed.
