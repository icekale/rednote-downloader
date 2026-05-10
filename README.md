# RedNote Downloader Service

[中文](README.md) | [English](README.en.md)

一个面向 Docker / Unraid 部署的自托管多平台媒体下载器，支持 RedNote / 小红书、`x.com` / `twitter.com`，以及抖音单视频链接或分享文案。它提供 Web UI、浏览器预览、本地代理下载、服务端保存和 Telegram 回传。

从 `v0.2.23` 开始，Docker 镜像内置 `jiji262/douyin-downloader` REST 服务。抖音单视频可以在同一个容器内完成解析与服务端下载，不需要再额外部署 Python 下载器。

## 主要功能

- 小红书 / RedNote：支持分享文案、`xhslink.com` 短链和页面链接解析下载。
- X / Twitter：支持帖子图片、视频媒体解析和代理下载。
- 抖音：支持单视频分享文案、短链和 `douyin.com/video/{aweme_id}`，Docker 镜像内置下载器，默认单容器可用。
- Web UI：输入链接即可预览图片/视频，支持浏览器代理下载和服务端保存。
- Telegram：可选配置 bot，把解析到的媒体回传到指定聊天。
- Unraid / Docker：使用 `/data` 挂载保存配置和下载结果，`XHS_COOKIE` 与 `DOUYIN_COOKIE` 分平台保存，Cookie 不写入镜像。

## 能力边界

- 抖音第一版只支持单视频，不支持图文、主页、合集、音乐、收藏、直播或批量主页下载。
- “去水印”定义为优先选择平台返回的无水印或低水印视频源；如果只能拿到疑似带水印候选，会返回 warning 并仍允许下载。
- 服务不会对媒体做转码、压缩、裁剪或 OpenCV/ffmpeg 水印擦除。
- 如果目标站点返回验证码、风控页，或者没有暴露可用媒体地址，服务会直接报错。
- Docker 镜像默认内置 `jiji262/douyin-downloader` REST 服务，用于抖音服务端下载；Cookie 只在运行时通过 Web UI 或环境变量传入，不会写入镜像。

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

返回服务、Telegram 和抖音下载器的诊断信息。

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

## 抖音内置下载器

Docker 镜像默认把 `jiji262/douyin-downloader` 打包在同一个容器里，并在容器内监听 `127.0.0.1:8000`。服务端下载抖音时会优先走这个内置 REST 下载器，输出目录默认是：

```text
/data/downloads/douyin
```

如果在 Unraid 部署，宿主机默认对应：

```text
/mnt/user/appdata/rednote/downloads/douyin
```

Cookie 有两种写入方式：

- 在 Web UI 的“抖音 Cookie”输入框填写，只对当前请求生效。
- 在 Unraid Docker 模板或 compose `.env` 里设置 `DOUYIN_COOKIE=...`，长期保存并作为默认抖音 Cookie。

不要把抖音 Cookie 写进镜像，也不要和 `XHS_COOKIE` 混用；`XHS_COOKIE` 只用于小红书，`DOUYIN_COOKIE` 只用于抖音。

如果不想启动内置下载器，可以设置：

```bash
DOUYIN_INTERNAL_DOWNLOADER_ENABLED=false
```

如果希望改用一个独立的外部 `jiji262/douyin-downloader` REST 服务，设置：

```bash
DOUYIN_INTERNAL_DOWNLOADER_ENABLED=false
DOUYIN_DOWNLOADER_BASE_URL=http://host.docker.internal:8000
DOUYIN_DOWNLOADER_OUTPUT_DIR=/path/to/douyin-downloader/Downloaded
```

对应环境变量：

- `DOUYIN_INTERNAL_DOWNLOADER_ENABLED`: 是否启动镜像内置抖音下载器，默认 `true`。
- `DOUYIN_INTERNAL_DOWNLOADER_PORT`: 内置抖音下载器监听端口，默认 `8000`，只绑定容器内 `127.0.0.1`。
- `DOUYIN_DOWNLOADER_BASE_URL`: 外部抖音下载器 REST 地址；不设置时，内置模式默认使用 `http://127.0.0.1:8000`。
- `DOUYIN_DOWNLOADER_OUTPUT_DIR`: 抖音下载器输出目录，用于代理本地下载结果；内置模式默认 `/data/downloads/douyin`。
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
- `DOUYIN_COOKIE`: 可选，受限抖音单视频解析或内置/外部下载器可尝试带 Cookie。Unraid 模板里建议单独填写，不要和小红书 Cookie 混在一起。
- `DOUYIN_INTERNAL_DOWNLOADER_ENABLED`: 可选，Docker 默认 `true`，设为 `false` / `0` / `no` / `off` 可关闭镜像内置抖音下载器。
- `DOUYIN_INTERNAL_DOWNLOADER_PORT`: 可选，内置抖音下载器容器内端口，默认 `8000`。
- `DOUYIN_DOWNLOADER_BASE_URL`: 可选，外部抖音下载器 REST 地址；留空时内置模式自动使用 `http://127.0.0.1:8000`。
- `DOUYIN_DOWNLOADER_OUTPUT_DIR`: 可选，抖音下载器输出目录；留空时内置模式自动使用 `/data/downloads/douyin`。
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
