# RedNote Downloader

RedNote Downloader 是一个面向本地部署的媒体解析与下载服务，支持 RedNote / 小红书 和 X / Twitter。它把网页解析、代理下载、Telegram 回传和 OpenClaw 接入收进同一个 Docker 镜像里，适合做一个干净、稳定、可自托管的小工具。

你可以直接粘贴帖子链接或整段分享文案，在浏览器里预览图片和视频，按需代理下载，或者把结果交给 Telegram bot 和 OpenClaw agent。

## 主要功能

- 支持 RedNote / 小红书 和 X / Twitter 帖子解析
- 支持粘贴分享链接，也支持整段分享文案
- 浏览器内直接预览图片和视频
- 通过本地代理下载，减少防盗链和跨域问题
- 可选把文件保存到容器挂载目录
- 公开帖子通常无需 Cookie，只有受限小红书帖子才需要手动补
- 内置 Telegram 配置页，可直接切换发送模式
- 内置 OpenClaw MCP 配置片段和推荐提示词
- 单容器即可运行全部能力

## 容器里运行的内容

- 一个监听 `3000` 端口的 Node.js 服务
- 一个标签页式网页控制台
- 面向浏览器和 agent 的解析接口
- 配好 token 后可选启用的 Telegram bot 轮询器
- 默认位于 `/data/downloads` 的下载目录
- 默认位于 `/data/config` 的配置和 Telegram 状态目录

## 快速开始

```bash
docker run -d \
  --name rednote-downloader \
  --restart unless-stopped \
  -p 3000:3000 \
  -e PUID="$(id -u)" \
  -e PGID="$(id -g)" \
  -v "$(pwd)/data:/data" \
  icekale/rednote-downloader:v0.2.13
```

如果你希望始终跟随最新镜像，也可以把 tag 换成 `latest`。

启动后打开：

```text
http://127.0.0.1:3000/
```

## Compose 示例

```yaml
services:
  rednote-downloader:
    image: icekale/rednote-downloader:v0.2.13
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

如果你跑在 Unraid 上，仓库里也单独准备了一份 `compose.unraid.yaml`，不会覆盖原来的通用 compose。它默认使用：

- `PUID=99`
- `PGID=100`
- `REDNOTE_DATA_DIR=/mnt/user/appdata/rednote`

示例：

```bash
REDNOTE_DATA_DIR=/mnt/user/appdata/rednote docker compose -f compose.unraid.yaml up -d
```

## 环境变量

- `HOST`: 监听地址，默认 `0.0.0.0`
- `PORT`: 服务端口，默认 `3000`
- `DOWNLOAD_DIR`: 下载目录，默认 `/data/downloads`
- `APP_CONFIG_PATH`: 配置文件路径，默认 `/data/config/.rednote-config.json`
- `APP_STATE_PATH`: Telegram 轮询状态路径，默认 `/data/config/.rednote-state.json`
- `REDNOTE_DATA_DIR`: 仅 compose 使用。宿主机映射到容器 `/data` 的目录；NAS 建议填绝对路径
- `PUID` / `PGID`: 容器启动时实际切换到的运行 uid/gid
- `XHS_COOKIE`: 可选，给受限小红书帖子补 Cookie
- `XHS_USER_AGENT`: 可选，自定义请求 UA
- `REQUEST_TIMEOUT_MS`: 可选，请求超时，默认 `15000`
- `MEDIA_REQUEST_TIMEOUT_MS`: 可选，媒体请求首包超时，默认 `30000`
- `TELEGRAM_ENABLED`: 可选，设为 `false` / `0` 时禁用 Telegram 轮询器
- `TELEGRAM_BOT_TOKEN`: 可选，Telegram bot token
- `TELEGRAM_ALLOWED_CHAT_IDS`: 可选，允许使用的 chat id 列表
- `TELEGRAM_DELIVERY_MODE`: `document` 或 `preview`
- `REDNOTE_ADMIN_TOKEN`: 可选，设置后管理接口需要带 `X-Admin-Token`
- `CORS_ALLOWED_ORIGINS`: 可选，额外允许跨域访问管理接口的 Origin 列表

## 注意事项

- 不会转码、压缩或重新加水印
- 大多数公开帖子不需要 Cookie
- 如果目标页面返回风控页、验证码页，或根本没有暴露可用媒体地址，服务会直接报错
- X / Twitter 通过公开元数据接口解析，再从原始媒体域名下载
- OpenClaw 工具返回的是适合 Telegram 使用的说明文本和直链媒体地址
- 同一个 Telegram bot token 同时只能有一个长轮询实例；如果只是临时起副本做检查，建议设置 `TELEGRAM_ENABLED=false`
- 如果旧版本把配置直接保存在 `/data` 根目录，升级后首次启动会自动复制到 `/data/config`
- 如果旧版本把历史下载目录直接放在 `/data` 根目录，升级后首次启动会把符合旧命名规则的目录自动移动到 `/data/downloads`
- 如果你在 Unraid 上部署，通常可以先尝试 `PUID=99`、`PGID=100`，这通常对应默认的 `nobody:users`

## 适合谁

- 想自托管一个轻量下载工具的个人用户
- 想把 Telegram 和 OpenClaw 接到同一条媒体链路上的开发者
- 偏好 Docker-first、本地浏览器控制台工具的技术用户
