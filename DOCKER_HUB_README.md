# RedNote Downloader

RedNote Downloader 是一个面向 Docker / Unraid 的自托管多平台媒体下载器，支持 RedNote / 小红书、X / Twitter 和抖音单视频。它提供 Web UI、浏览器预览、本地代理下载、服务端保存和 Telegram 回传。

`v0.2.23` 起，镜像内置 `jiji262/douyin-downloader` REST 服务。抖音单视频可在一个容器内完成解析与服务端下载，不需要额外部署 Python 下载器。

## 主要功能

- 小红书 / RedNote：支持分享文案、短链和页面链接。
- X / Twitter：支持帖子图片和视频媒体。
- 抖音：支持单视频分享文案、短链和 `douyin.com/video/{aweme_id}`，镜像内置下载器，默认单容器可用。
- Web UI：浏览器内直接预览图片和视频，支持本地代理下载。
- 服务端保存：媒体写入 `/data/downloads`，抖音默认写入 `/data/downloads/douyin`。
- Telegram：可选配置 bot 回传媒体。
- Cookie 分平台管理：小红书使用 `XHS_COOKIE`，抖音使用 `DOUYIN_COOKIE`，运行时传入，不写入镜像。

## 快速开始

```bash
docker run -d \
  --name rednote-downloader \
  --restart unless-stopped \
  -p 3000:3000 \
  -e PUID="$(id -u)" \
  -e PGID="$(id -g)" \
  -v "$(pwd)/data:/data" \
  icekale/rednote-downloader:v0.2.23
```

启动后打开：

```text
http://127.0.0.1:3000/
```

## 关键环境变量

- `DOWNLOAD_DIR`: 下载目录，默认 `/data/downloads`
- `APP_CONFIG_PATH`: 配置文件路径，默认 `/data/config/.rednote-config.json`
- `APP_STATE_PATH`: Telegram 轮询状态路径，默认 `/data/config/.rednote-state.json`
- `XHS_COOKIE`: 可选，给受限小红书帖子补 Cookie
- `DOUYIN_COOKIE`: 可选，给受限抖音单视频解析或内置/外部抖音下载器补 Cookie
- `DOUYIN_INTERNAL_DOWNLOADER_ENABLED`: 可选，默认 `true`，启动镜像内置抖音下载器
- `DOUYIN_INTERNAL_DOWNLOADER_PORT`: 可选，内置抖音下载器容器内端口，默认 `8000`
- `DOUYIN_DOWNLOADER_BASE_URL`: 可选，外部抖音下载器 REST 地址；内置模式默认 `http://127.0.0.1:8000`
- `DOUYIN_DOWNLOADER_OUTPUT_DIR`: 可选，抖音下载器输出目录；内置模式默认 `/data/downloads/douyin`
- `TELEGRAM_ENABLED`: 可选，设为 `false` / `0` 时禁用 Telegram 轮询器
- `TELEGRAM_BOT_TOKEN`: 可选，Telegram bot token
- `TELEGRAM_ALLOWED_CHAT_IDS`: 可选，允许使用的 chat id 列表
- `TELEGRAM_DELIVERY_MODE`: `document` 或 `preview`
- `REDNOTE_ADMIN_TOKEN`: 可选，设置后管理接口需要带 `X-Admin-Token`

## 注意事项

- 抖音当前只支持单视频，不支持图文、主页、合集、音乐、收藏、直播或批量主页下载。
- “去水印”是优先使用平台返回的无水印或低水印源，不做图像级水印擦除。
- 不会转码、压缩或重新加水印。
- Cookie 不会写入镜像，需要运行时通过 UI 或环境变量传入。小红书用 `XHS_COOKIE`，抖音用 `DOUYIN_COOKIE`。
- Unraid 建议在 Docker 模板里填写 `DOUYIN_COOKIE` 长期保存抖音鉴权；抖音下载文件默认保存在 `/data/downloads/douyin`，对应你映射的 appdata 目录。
- 同一个 Telegram bot token 同时只能有一个长轮询实例。
