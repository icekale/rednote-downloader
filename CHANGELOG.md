# Changelog

## Unreleased

## v0.2.16 - 2026-03-20

- Unify media filename generation across server downloads, browser proxy downloads, Telegram uploads, and OpenClaw proxy links so the same post resolves to the same predictable file names everywhere.
- Add configurable batch resolve and per-post media download concurrency to speed up larger workloads without losing output order.
- Refactor the HTTP server into a reusable app factory and add integration tests for admin auth, CORS, batch resolve concurrency, config persistence, and media proxy fallback behavior.
- Add a dedicated GitHub Actions test workflow so `npm test` now runs automatically on pushes to `main` and on pull requests.

## v0.2.15 - 2026-03-20

- Fix X/Twitter multi-video download filename collisions so files from the same post no longer overwrite each other during server-side downloads. Multi-video posts now save as indexed files such as `_01`, `_02`, and `_03`, and the web UI uses the same naming for proxy downloads.
- Start tracking upcoming release notes in `CHANGELOG.md` and reference the `Unreleased` section from the README release workflow.
