# RedNote Downloader Service

[中文](README.md) | [English](README.en.md)

A Docker-first self-hosted media resolver for RedNote/Xiaohongshu, `x.com` / `twitter.com`, and Douyin single-video links or share text. It provides browser preview, local proxy downloads, optional server-side saving, and Telegram delivery. Agent / OpenClaw / MCP integration has been removed.

## Highlights

- Resolve Xiaohongshu share text, `xhslink.com`, and RedNote page URLs.
- Resolve `x.com` / `twitter.com` post media.
- Resolve Douyin single-video share text, short links, and `douyin.com/video/{aweme_id}` URLs.
- Preview media in the browser and download through the local `/api/media` proxy.
- Optionally save media to the server download directory.
- Optionally configure a Telegram bot for media delivery.
- Reuse the Cookie field as a request-level Cookie header for restricted or anti-bot cases.

## Boundaries

- Douyin support is single-video only. Gallery posts, profiles, collections, music pages, favorites, live streams, and profile batch downloads are not included.
- "No watermark" means the service prefers no-watermark or low-watermark sources returned by the platform. If only a suspicious candidate is available, the service returns a warning and still allows download.
- The service does not transcode, recompress, crop, or remove watermarks with ffmpeg/OpenCV.
- If a target site returns an anti-bot page, captcha, or no usable media URL, the service fails fast.
- Server-side Douyin downloads can optionally use the REST mode of `jiji262/douyin-downloader`. Cookies are not baked into the image.

## Quick Start

```bash
npm test
npm start
```

Open:

```text
http://127.0.0.1:3000/
```

Docker Hub:

```bash
docker compose -f compose.hub.yaml up -d
```

## External Douyin Downloader

For preview-only workflows, the built-in Douyin single-video resolver can be used directly. For server-side downloading through `jiji262/douyin-downloader`, run its REST service and configure:

```bash
DOUYIN_DOWNLOADER_BASE_URL=http://127.0.0.1:8000
DOUYIN_DOWNLOADER_OUTPUT_DIR=/path/to/douyin-downloader/Downloaded
```

## Environment Variables

- `HOST`: bind address, default `0.0.0.0` in Docker.
- `PORT`: service port, default `3000`.
- `DOWNLOAD_DIR`: download directory, default `/data/downloads`.
- `APP_CONFIG_PATH`: app config path, default `/data/config/.rednote-config.json`.
- `APP_STATE_PATH`: Telegram polling state path, default `/data/config/.rednote-state.json`.
- `REDNOTE_DATA_DIR`: compose-only host path mounted to `/data`.
- `PUID` / `PGID`: runtime uid/gid used by the container entrypoint.
- `XHS_COOKIE`: optional manual Cookie header for protected RedNote posts.
- `XHS_USER_AGENT`: optional custom request user agent.
- `DOUYIN_DOWNLOADER_BASE_URL`: optional external Douyin downloader REST URL.
- `DOUYIN_DOWNLOADER_OUTPUT_DIR`: optional external downloader output directory.
- `DOUYIN_DOWNLOADER_TIMEOUT_MS`: optional external job timeout, default 10 minutes.
- `DOUYIN_DOWNLOADER_POLL_INTERVAL_MS`: optional external job poll interval, default 1500ms.
- `TELEGRAM_ENABLED`: optional; set to `false` / `0` to disable the Telegram polling bot.
- `TELEGRAM_BOT_TOKEN`: optional Telegram bot token.
- `TELEGRAM_ALLOWED_CHAT_IDS`: optional allowlist of chat ids.
- `TELEGRAM_DELIVERY_MODE`: `document` or `preview`.
- `REDNOTE_ADMIN_TOKEN`: optional admin token required by protected management endpoints.
- `CORS_ALLOWED_ORIGINS`: optional comma-separated list of extra allowed origins.

## Documentation

- Full Chinese documentation: [README.md](README.md)
- Docker Hub deployment guide: [DOCKER_HUB_README.en.md](DOCKER_HUB_README.en.md)
- Releases: [GitHub Releases](https://github.com/icekale/rednote-downloader/releases)
