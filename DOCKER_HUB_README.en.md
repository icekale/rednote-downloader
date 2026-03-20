# RedNote Downloader

RedNote Downloader is a self-hosted media resolver for RedNote / Xiaohongshu and X / Twitter. It gives you a clean browser UI, proxy downloads, optional Telegram delivery, and an OpenClaw-ready MCP bridge in one Docker image.

This image is built for people who want a small local tool instead of a scraping stack. Paste a post URL or full share text, preview the media in the browser, download through the local service, or hand the result off to Telegram and OpenClaw workflows.

## Highlights

- Resolve public media from RedNote / Xiaohongshu and X / Twitter posts
- Paste either a share URL or the full share text
- Preview images and videos directly in the browser
- Download through a local proxy to avoid hotlink and CORS issues
- Optionally save files into a mounted download directory
- Import cookies manually only when a protected RedNote post needs them
- Configure Telegram delivery from the built-in web console
- Generate OpenClaw MCP snippets and agent prompts from the same UI
- Run the whole stack in one container

## What Runs Inside The Container

- A Node.js HTTP service on port `3000`
- A polished local control panel with tabs for Resolve, Telegram, OpenClaw, and Diagnostics
- Media resolution APIs for browser and agent workflows
- An optional Telegram polling bot when a bot token is configured
- Download storage under `/data/downloads`
- App config and Telegram polling state under `/data/config`

## Quick Start

```bash
docker run -d \
  --name rednote-downloader \
  --restart unless-stopped \
  -p 3000:3000 \
  -e PUID="$(id -u)" \
  -e PGID="$(id -g)" \
  -v "$(pwd)/data:/data" \
  icekale/rednote-downloader:v0.2.15
```

If you prefer a floating tag, replace `v0.2.15` with `latest`.

Then open:

```text
http://127.0.0.1:3000/
```

## Compose

```yaml
services:
  rednote-downloader:
    image: icekale/rednote-downloader:v0.2.15
    container_name: rednote-downloader
    ports:
      - "3000:3000"
    environment:
      HOST: 0.0.0.0
      PORT: "3000"
      PUID: ${PUID:-1000}
      PGID: ${PGID:-1000}
      DOWNLOAD_DIR: /data/downloads
      APP_CONFIG_PATH: /data/config/.rednote-config.json
      APP_STATE_PATH: /data/config/.rednote-state.json
      XHS_COOKIE: ${XHS_COOKIE:-}
      XHS_USER_AGENT: ${XHS_USER_AGENT:-}
      REQUEST_TIMEOUT_MS: ${REQUEST_TIMEOUT_MS:-15000}
      MEDIA_REQUEST_TIMEOUT_MS: ${MEDIA_REQUEST_TIMEOUT_MS:-30000}
      TELEGRAM_ENABLED: ${TELEGRAM_ENABLED:-}
      TELEGRAM_BOT_TOKEN: ${TELEGRAM_BOT_TOKEN:-}
      TELEGRAM_ALLOWED_CHAT_IDS: ${TELEGRAM_ALLOWED_CHAT_IDS:-}
      TELEGRAM_DELIVERY_MODE: ${TELEGRAM_DELIVERY_MODE:-document}
      REDNOTE_ADMIN_TOKEN: ${REDNOTE_ADMIN_TOKEN:-}
      CORS_ALLOWED_ORIGINS: ${CORS_ALLOWED_ORIGINS:-}
    volumes:
      - ${REDNOTE_DATA_DIR:-./data}:/data
    restart: unless-stopped
```

## Unraid Compose

If you run this on Unraid, there is also a separate `compose.unraid.yaml` in the repo so you don't have to overwrite the generic Compose example. It defaults to:

- `PUID=99`
- `PGID=100`
- `REDNOTE_DATA_DIR=/mnt/user/appdata/rednote`

Example:

```bash
REDNOTE_DATA_DIR=/mnt/user/appdata/rednote docker compose -f compose.unraid.yaml up -d
```

## Environment Variables

- `HOST`: bind address, default `0.0.0.0`
- `PORT`: service port, default `3000`
- `DOWNLOAD_DIR`: download directory, default `/data/downloads`
- `APP_CONFIG_PATH`: app config path, default `/data/config/.rednote-config.json`
- `APP_STATE_PATH`: polling state path, default `/data/config/.rednote-state.json`
- `REDNOTE_DATA_DIR`: compose-only host path mounted to `/data`; use an absolute path on NAS
- `PUID` / `PGID`: runtime uid/gid used by the container entrypoint before the service starts
- `XHS_COOKIE`: optional manual cookie header for protected RedNote posts
- `XHS_USER_AGENT`: optional custom request user agent
- `REQUEST_TIMEOUT_MS`: optional request timeout in milliseconds, default `15000`
- `MEDIA_REQUEST_TIMEOUT_MS`: optional timeout for receiving media response headers, default `30000`
- `TELEGRAM_ENABLED`: optional; set to `false` / `0` to disable the Telegram polling bot
- `TELEGRAM_BOT_TOKEN`: optional Telegram bot token
- `TELEGRAM_ALLOWED_CHAT_IDS`: optional allowlist of chat ids
- `TELEGRAM_DELIVERY_MODE`: `document` or `preview`
- `REDNOTE_ADMIN_TOKEN`: optional admin token required by protected management endpoints
- `CORS_ALLOWED_ORIGINS`: optional comma-separated list of extra allowed cross-origin management UIs

## Notes

- No transcoding, recompression, or watermarking is applied
- Public posts usually work without cookies; cookies are mostly a fallback for restricted RedNote pages
- If the target page returns an anti-bot page or does not expose usable media URLs, the service returns an error
- X / Twitter metadata is resolved through public metadata APIs and then downloaded from the original media hosts
- The OpenClaw tool output includes Telegram-ready text plus direct media URLs
- A Telegram bot token can only be long-polled by one running instance at a time; use `TELEGRAM_ENABLED=false` for temporary sidecar checks
- Legacy config files stored directly under `/data` are copied into `/data/config` on first boot after upgrade
- Legacy download folders stored directly under `/data` are moved into `/data/downloads` on first boot when they match the old naming pattern
- On Unraid, `PUID=99` and `PGID=100` usually match the default `nobody:users` share ownership

## Best Fit

- Self-hosters who want a compact personal downloader
- Telegram and OpenClaw users who want one local media bridge
- Developers who prefer Docker-first tooling with a browser UI
