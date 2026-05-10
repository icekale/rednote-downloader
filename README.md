# RedNote Downloader Service

[中文](README.md) | [English](README.en.md)

一个 Docker-first 的自托管媒体解析与下载工具，支持 RedNote / 小红书、`x.com` / `twitter.com`，以及抖音单视频链接或分享文案。它提供网页预览、本地代理下载、可选服务端保存和 Telegram 回传，不再包含 Agent / OpenClaw / MCP 接入功能。

## 主要功能

- 解析小红书分享文案、`xhslink.com`、RedNote 页面链接。
- 解析 `x.com` / `twitter.com` 帖子媒体。
- 解析抖音单视频分享文案、短链和 `douyin.com/video/{aweme_id}`。
- 浏览器内预览图片和视频，并通过本地 `/api/media` 代理下载。
- 可选保存到服务端下载目录。
- 可选配置 Telegram bot，把解析到的媒体回传到聊天。
- Cookie 鉴权分为小红书和抖音两个输入框；Unraid/Docker 也可用 `XHS_COOKIE` 和 `DOUYIN_COOKIE` 分别长期保存。

## 能力边界

- 抖音第一版只支持单视频，不支持图文、主页、合集、音乐、收藏、直播或批量主页下载。
- “去水印”定义为优先选择平台返回的无水印或低水印视频源；如果只能拿到疑似带水印候选，会返回 warning 并仍允许下载。
- 服务不会对媒体做转码、压缩、裁剪或 OpenCV/ffmpeg 水印擦除。
- 如果目标站点返回验证码、风控页，或者没有暴露可用媒体地址，服务会直接报错。
- 抖音服务端下载可选接入 `jiji262/douyin-downloader` 的 REST 服务；Cookie 不会写入镜像。

## API

### `GET /healthz`

健康检查。

### `POST /api/resolve`

请求体：

```json
{
  "input": "小红书、X/Twitter、抖音单视频链接或分享文案",
  "download": true,
  "xhsCookie": "可选，小红书 Cookie header",
  "douyinCookie": "可选，抖音 Cookie header",
  "cookie": "可选，旧版兼容字段"
}
```

返回：

- `download: false` 时返回解析出的媒体信息。
- `download: true` 时把文件保存到 `DOWNLOAD_DIR`，并返回保存路径。
- 批量输入支持一行一个链接，返回 `batch: true` 和 `results`。

### `GET /api/media`

代理下载远端媒体或允许目录内的本地媒体。

常见参数：

- `url`: 远端媒体 URL。
- `fallback`: 可重复传入的备用媒体 URL。
- `path`: 本地媒体绝对路径，必须位于允许目录内。
- `filename`: 下载文件名。
- `inline=1`: 浏览器内预览。

### `GET /api/telegram/status`

返回当前 Telegram bot 运行状态。

### `GET /api/config`

返回网页控制台使用的公开配置快照。

### `POST /api/config`

保存 Telegram 配置，并在保存后热更新 Telegram 运行态。

### `GET /api/diagnostics`

返回服务、Telegram 和外部抖音下载器的诊断信息。

## 本地运行

```bash
npm test
npm start
```

默认监听：

```text
http://127.0.0.1:3000/
```

## Docker

构建：

```bash
docker build -t rednote-downloader .
```

运行：

```bash
docker run -d \
  --name rednote-downloader \
  --restart unless-stopped \
  -p 3000:3000 \
  -e PUID="$(id -u)" \
  -e PGID="$(id -g)" \
  -e XHS_COOKIE='小红书 cookie，可选' \
  -e DOUYIN_COOKIE='抖音 cookie，可选' \
  -v "$(pwd)/data:/data" \
  rednote-downloader
```

Docker Hub 镜像：

```bash
docker compose -f compose.hub.yaml up -d
```

Unraid 示例：

```bash
REDNOTE_DATA_DIR=/mnt/user/appdata/rednote docker compose -f compose.unraid.yaml up -d
```

## 抖音外部下载器

如果只做解析预览，可以直接使用本服务内置抖音单视频解析。若希望服务端下载尽量复用 `jiji262/douyin-downloader`，先启动它的 REST 服务，再给本服务配置：

```bash
DOUYIN_DOWNLOADER_BASE_URL=http://127.0.0.1:8000
DOUYIN_DOWNLOADER_OUTPUT_DIR=/path/to/douyin-downloader/Downloaded
```

对应环境变量：

- `DOUYIN_DOWNLOADER_BASE_URL`: 外部抖音下载器 REST 地址。
- `DOUYIN_DOWNLOADER_OUTPUT_DIR`: 外部下载器输出目录，用于代理本地下载结果。
- `DOUYIN_DOWNLOADER_TIMEOUT_MS`: 可选，等待外部下载任务超时，默认 10 分钟。
- `DOUYIN_DOWNLOADER_POLL_INTERVAL_MS`: 可选，轮询外部任务间隔，默认 1500ms。

## Telegram Bot Mode

环境变量：

- `TELEGRAM_BOT_TOKEN`: Telegram bot token。
- `TELEGRAM_ENABLED`: 可选，设为 `false` / `0` 时禁用轮询器。
- `TELEGRAM_ALLOWED_CHAT_IDS`: 可选，允许使用 bot 的 chat id，逗号分隔。
- `TELEGRAM_DELIVERY_MODE`: `document` 或 `preview`。

也可以在网页的 Telegram 标签页保存配置。Docker 默认配置路径：

```text
/data/config/.rednote-config.json
```

Telegram 轮询状态路径：

```text
/data/config/.rednote-state.json
```

## 环境变量

- `PORT`: 服务端口，默认 `3000`。
- `HOST`: 监听地址，本机默认 `127.0.0.1`，Docker 默认 `0.0.0.0`。
- `DOWNLOAD_DIR`: 下载目录，Docker 默认 `/data/downloads`。
- `APP_CONFIG_PATH`: 配置保存路径，Docker 默认 `/data/config/.rednote-config.json`。
- `APP_STATE_PATH`: Telegram 状态路径，Docker 默认 `/data/config/.rednote-state.json`。
- `REDNOTE_DATA_DIR`: 仅 compose 示例使用，宿主机映射到容器 `/data` 的根目录。
- `PUID` / `PGID`: 仅 compose 示例使用，控制容器写入挂载目录的 uid/gid。
- `XHS_COOKIE`: 可选，受限小红书页面可尝试带 Cookie。
- `DOUYIN_COOKIE`: 可选，受限抖音单视频解析或外部下载器可尝试带 Cookie。Unraid 模板里建议单独填写，不要和小红书 Cookie 混在一起。
- `XHS_USER_AGENT`: 可选，覆盖默认浏览器 UA。
- `REQUEST_TIMEOUT_MS`: 可选，普通请求超时，默认 `15000`。
- `BATCH_RESOLVE_CONCURRENCY`: 可选，批量解析并发数，默认 `3`。
- `MEDIA_DOWNLOAD_CONCURRENCY`: 可选，服务端下载同一帖子多媒体时的并发数，默认 `3`。
- `MEDIA_DOWNLOAD_RETRY_COUNT`: 可选，同一候选直链重试次数，默认 `1`。
- `MEDIA_REQUEST_TIMEOUT_MS`: 可选，媒体请求首包超时，默认 `30000`。
- `REDNOTE_ADMIN_TOKEN`: 可选，设置后管理接口需要 `X-Admin-Token`。
- `CORS_ALLOWED_ORIGINS`: 可选，额外允许跨域访问管理接口的 Origin，逗号分隔。

## GitHub Actions Auto Publish

仓库包含：

- `.github/workflows/test.yml`: push / PR 时运行语法检查和测试。
- `.github/workflows/docker-publish.yml`: push 到 `main` 发布 `latest`，推送 `v*` tag 发布版本标签。
- Docker 构建平台：`linux/amd64` 和 `linux/arm64`。

需要仓库 secrets：

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`
