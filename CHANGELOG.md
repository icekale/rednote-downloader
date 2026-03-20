# Changelog

## Unreleased

## v0.2.15 - 2026-03-20

- Fix X/Twitter multi-video download filename collisions so files from the same post no longer overwrite each other during server-side downloads. Multi-video posts now save as indexed files such as `_01`, `_02`, and `_03`, and the web UI uses the same naming for proxy downloads.
- Start tracking upcoming release notes in `CHANGELOG.md` and reference the `Unreleased` section from the README release workflow.
