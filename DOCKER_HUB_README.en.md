# RedNote Downloader

RedNote Downloader is a self-hosted media resolver for RedNote / Xiaohongshu, X / Twitter, and Douyin single-video links. It provides a browser UI, local proxy downloads, optional server-side saving, and optional Telegram delivery.

## Highlights

- Resolve RedNote/Xiaohongshu, X/Twitter, and Douyin single-video links or share text.
- Preview images and videos directly in the browser.
- Download through a local proxy to reduce hotlink and CORS issues.
- Optionally save files into a mounted directory.
- Optionally configure a Telegram bot for media delivery.
- Optionally connect to the REST mode of `jiji262/douyin-downloader` for Douyin server-side downloads.
- Agent / OpenClaw / MCP integration has been removed.

## Quick Start

```bash
docker run -d \
  --name rednote-downloader \
  --restart unless-stopped \
  -p 3000:3000 \
  -e PUID="$(id -u)" \
  -e PGID="$(id -g)" \
  -v "$(pwd)/data:/data" \
  icekale/rednote-downloader:v0.2.21
```

Then open:

```text
http://127.0.0.1:3000/
```

## Key Environment Variables

- `DOWNLOAD_DIR`: download directory, default `/data/downloads`
- `APP_CONFIG_PATH`: app config path, default `/data/config/.rednote-config.json`
- `APP_STATE_PATH`: Telegram polling state path, default `/data/config/.rednote-state.json`
- `XHS_COOKIE`: optional Cookie header for protected RedNote posts
- `DOUYIN_DOWNLOADER_BASE_URL`: optional external Douyin downloader REST URL
- `DOUYIN_DOWNLOADER_OUTPUT_DIR`: optional external Douyin downloader output directory
- `TELEGRAM_ENABLED`: optional; set to `false` / `0` to disable Telegram polling
- `TELEGRAM_BOT_TOKEN`: optional Telegram bot token
- `TELEGRAM_ALLOWED_CHAT_IDS`: optional chat id allowlist
- `TELEGRAM_DELIVERY_MODE`: `document` or `preview`
- `REDNOTE_ADMIN_TOKEN`: optional admin token required by protected management endpoints

## Notes

- Douyin support is single-video only in this release.
- "No watermark" means the service prefers no-watermark or low-watermark sources returned by the platform. It does not perform image-level watermark removal.
- No transcoding, recompression, or watermarking is applied.
- Cookies are not baked into the image. Pass them at runtime through the UI or environment.
- A Telegram bot token can only be long-polled by one running instance at a time.
