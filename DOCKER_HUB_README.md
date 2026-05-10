# RedNote Downloader

RedNote Downloader 是一个面向本地部署的媒体解析与下载服务，支持 RedNote / 小红书、X / Twitter 和抖音单视频。它提供网页预览、本地代理下载、可选服务端保存和 Telegram 回传。

## 主要功能

- 支持小红书、X / Twitter、抖音单视频链接或分享文案。
- 浏览器内直接预览图片和视频。
- 通过本地代理下载，减少防盗链和跨域问题。
- 可选保存到容器挂载目录。
- 可选配置 Telegram bot 回传媒体。
- 可选接入 `jiji262/douyin-downloader` REST 服务做抖音服务端下载。
- 不再包含 Agent / OpenClaw / MCP 接入功能。

## 快速开始

```bash
docker run -d \
  --name rednote-downloader \
  --restart unless-stopped \
  -p 3000:3000 \
  -e PUID="$(id -u)" \
  -e PGID="$(id -g)" \
  -v "$(pwd)/data:/data" \
  icekale/rednote-downloader:v0.2.22
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
- `DOUYIN_COOKIE`: 可选，给受限抖音单视频解析或外部抖音下载补 Cookie
- `DOUYIN_DOWNLOADER_BASE_URL`: 可选，外部抖音下载器 REST 地址
- `DOUYIN_DOWNLOADER_OUTPUT_DIR`: 可选，外部抖音下载器输出目录
- `TELEGRAM_ENABLED`: 可选，设为 `false` / `0` 时禁用 Telegram 轮询器
- `TELEGRAM_BOT_TOKEN`: 可选，Telegram bot token
- `TELEGRAM_ALLOWED_CHAT_IDS`: 可选，允许使用的 chat id 列表
- `TELEGRAM_DELIVERY_MODE`: `document` 或 `preview`
- `REDNOTE_ADMIN_TOKEN`: 可选，设置后管理接口需要带 `X-Admin-Token`

## 注意事项

- 抖音第一版只支持单视频。
- “去水印”是优先使用平台返回的无水印或低水印源，不做图像级水印擦除。
- 不会转码、压缩或重新加水印。
- Cookie 不会写入镜像，需要运行时通过 UI 或环境变量传入。小红书用 `XHS_COOKIE`，抖音用 `DOUYIN_COOKIE`。
- 同一个 Telegram bot token 同时只能有一个长轮询实例。
