# Changelog

## Unreleased

## v0.2.18 - 2026-03-22

- Change Telegram polling to acknowledge updates after each message is processed, so a failed later reply no longer causes the rest of that batch to be skipped on restart.
- Let Telegram uploads retry the media item's fallback URLs, matching the existing proxy and server-side download behavior when the preferred CDN link fails.
- Make server-side downloads use the media-specific request timeout by default, so `/api/resolve` with `download=true` is no longer stricter than `/api/media` or Telegram uploads.

## v0.2.17 - 2026-03-21

- Let the OpenClaw service base URL stay blank in saved config so the dashboard, diagnostics, and resolve payloads automatically follow the current request origin. This makes reverse proxies, alternate local ports, and temporary sidecar instances work without hand-editing the service URL.
- Move shared media filename generation into a neutral server/client module so browser proxy downloads, server-side downloads, Telegram uploads, and OpenClaw proxy links all use the same predictable naming logic.
- Add retries for transient media stream disconnects plus cleanup of partial files, so upstream CDN hiccups are less likely to leave failed downloads or truncated leftovers on disk.
- Expand automated validation with syntax checks, Node 20/22 CI coverage, config/HTTP integration tests for OpenClaw auto-origin behavior, and static-module serving tests for the browser filename helper.

## v0.2.16 - 2026-03-20

- Unify media filename generation across server downloads, browser proxy downloads, Telegram uploads, and OpenClaw proxy links so the same post resolves to the same predictable file names everywhere.
- Add configurable batch resolve and per-post media download concurrency to speed up larger workloads without losing output order.
- Refactor the HTTP server into a reusable app factory and add integration tests for admin auth, CORS, batch resolve concurrency, config persistence, and media proxy fallback behavior.
- Add a dedicated GitHub Actions test workflow so `npm test` now runs automatically on pushes to `main` and on pull requests.

## v0.2.15 - 2026-03-20

- Fix X/Twitter multi-video download filename collisions so files from the same post no longer overwrite each other during server-side downloads. Multi-video posts now save as indexed files such as `_01`, `_02`, and `_03`, and the web UI uses the same naming for proxy downloads.
- Start tracking upcoming release notes in `CHANGELOG.md` and reference the `Unreleased` section from the README release workflow.
