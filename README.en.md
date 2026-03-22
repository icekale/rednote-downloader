# RedNote Downloader Service

[中文](README.md) | [English](README.en.md)

A Docker-first self-hosted media tool for RedNote/Xiaohongshu and `x.com`/`twitter.com`. It combines link resolving, browser preview, proxy downloads, Telegram delivery, and OpenClaw integration into one Node.js service that is easy to keep running on a laptop, NAS, or small server.

The service supports three common workflows:

- Paste a post link or a full share message into the web UI to resolve, preview, and download images or videos.
- Send a link to a Telegram bot and let it deliver the media back into the chat.
- Call the service from OpenClaw through an MCP tool and pass the result into a wider agent workflow.

The built-in dashboard currently includes four tabs:

- `Resolve & Download`: resolve media, preview it in the browser, and optionally save files on the server
- `Telegram`: save the bot token, chat allowlist, and delivery mode through the UI
- `OpenClaw`: generate `mcporter` snippets and a recommended agent prompt
- `Diagnostics`: inspect the current runtime status of the service, Telegram, and OpenClaw

## What This Service Does

- Prefers direct CDN URLs already exposed by the page whenever possible.
- Tries original image URLs and the best available video candidate before falling back to secondary sources.
- Uses the FixTweet API for X/Twitter metadata, then downloads media directly from `pbs.twimg.com` and `video.twimg.com`.
- Does not transcode, recompress, or watermark media.
- Fails fast when Xiaohongshu returns a verification page or hides the media behind anti-bot controls.

## Quick Start

Run locally:

```bash
npm test
npm start
```

Then open:

```text
http://127.0.0.1:3000/
```

Or use Docker Hub:

```bash
docker compose -f compose.hub.yaml up -d
```

## Documentation

- Full Chinese documentation: [README.md](README.md)
- Docker Hub deployment guide: [DOCKER_HUB_README.en.md](DOCKER_HUB_README.en.md)
- Releases: [GitHub Releases](https://github.com/icekale/rednote-downloader/releases)
