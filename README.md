# RedNote Downloader Service

一个 Docker-first 的自托管媒体工具，支持 RedNote / 小红书 和 `x.com` / `twitter.com`。它把帖子解析、浏览器预览、代理下载、Telegram 回传和 OpenClaw 接入放进同一个 Node 服务里，适合在本地或小型服务器上长期运行。

服务支持三种常见用法：

- 在网页里粘贴帖子链接或整段分享文案，直接解析、预览和下载图片/视频
- 在 Telegram 里把链接发给 bot，让它把媒体回到聊天里
- 在 OpenClaw 里通过 MCP 工具调用本服务，把结果继续交给 agent 工作流

当前前端控制台包含四个标签页：

- `解析下载`：解析媒体、批量浏览器下载、可选保存到服务端目录
- `Telegram`：图形化保存 bot token、chat allowlist 和发送模式
- `OpenClaw`：生成 `mcporter` 配置片段和推荐 agent 提示词
- `诊断`：查看服务、Telegram、OpenClaw 的当前运行状态

## 能力边界

- 服务优先使用页面里直接暴露出来的 CDN 地址。
- 图片下载优先尝试页面图片地址推导出的 `ci.xiaohongshu.com` 直链。
- 视频下载优先尝试 `originVideoKey` 对应的直链，其次回退到页面流地址。
- `x.com` / `twitter.com` 帖子当前通过 `FixTweet API` 获取元数据，再直接回源下载 `pbs.twimg.com` / `video.twimg.com` 地址。
- 服务不会对媒体做二次压缩、转码或重新加水印。
- 如果小红书返回验证码、风控页，或者页面没有暴露直链，服务会直接报错，不做绕过。

## API

### `GET /healthz`

健康检查。

### `POST /api/resolve`

请求体：

```json
{
  "input": "小红书分享文案、x.com/twitter.com 链接，或者分享文本",
  "download": true,
  "cookie": "可选，覆盖环境变量 XHS_COOKIE"
}
```

返回：

- `download: false` 时，返回解析出的媒体直链信息。
- `download: true` 时，服务会把文件下载到 `DOWNLOAD_DIR`，并返回实际保存路径。

### `GET /api/telegram/status`

返回当前 Telegram bot 模式是否启用。

### `GET /api/config`

返回当前图形化配置页使用的配置快照。

### `POST /api/config`

保存 Telegram / OpenClaw 配置，并在 Telegram 配置变更后立即热更新运行时。

### `GET /api/openclaw/template`

返回 OpenClaw 接入模板：

- `mcporter` 配置片段
- 推荐 agent 提示词
- 当前使用的服务地址、MCP server 名称、推荐 agent id

### `POST /api/openclaw/resolve`

给 OpenClaw / MCP 用的专用接口。请求体：

```json
{
  "input": "小红书分享文案、x.com/twitter.com 链接，或者分享文本",
  "cookie": "可选",
  "serviceBaseUrl": "可选，覆盖返回的代理 media URL 根地址"
}
```

返回：

- `openclaw.text`: 推荐发回 Telegram 的说明文字
- `openclaw.mediaUrls`: 适合直接交给 Telegram 发送的直链媒体 URL 列表
- `openclaw.telegramReply`: 可直接原样回发的 Telegram 文本块
- `note`: 原始解析结果

## 本地运行

```bash
npm test
npm start
```

默认监听 `http://127.0.0.1:3000`。

浏览器打开：

```text
http://127.0.0.1:3000/
```

首页右侧有两个配置面板：

- `Telegram Bot 配置`
- `OpenClaw Agent 接入`

示例：

```bash
curl -s http://127.0.0.1:3000/healthz
```

```bash
curl -s http://127.0.0.1:3000/api/resolve \
  -H 'Content-Type: application/json' \
  -d '{
    "input": "http://xhslink.com/a/your-share-link",
    "download": false
  }'
```

```bash
curl -s http://127.0.0.1:3000/api/resolve \
  -H 'Content-Type: application/json' \
  -d '{
    "input": "http://xhslink.com/a/your-share-link",
    "download": true
  }'
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
  --user "$(id -u):$(id -g)" \
  -p 3000:3000 \
  -e XHS_COOKIE='你的 cookie，可选' \
  -v "$(pwd)/data:/data" \
  rednote-downloader
```

或者：

```bash
docker compose up --build
```

如果你想直接使用 Docker Hub 已发布镜像：

```bash
docker compose -f compose.hub.yaml up -d
```

`compose.hub.yaml` 当前默认固定到 `icekale/rednote-downloader:v0.2.9`。

Docker 默认会把容器内目录拆成：

```text
/data/downloads
/data/config
```

如果你在 NAS 或 Portainer 上部署，建议把 `REDNOTE_DATA_DIR` 设成绝对路径，例如：

```bash
REDNOTE_DATA_DIR=/volume1/docker/rednote docker compose -f compose.hub.yaml up -d
```

## Telegram Bot Mode

设置下面的环境变量后，服务启动时会同时拉起一个 Telegram bot 轮询器：

- `TELEGRAM_BOT_TOKEN`: 你的 Telegram bot token
- `TELEGRAM_ENABLED`: 可选。设为 `false` / `0` 时，即使环境里或已保存配置里有 token 也不启动轮询器
- `TELEGRAM_ALLOWED_CHAT_IDS`: 可选，允许使用 bot 的 chat id 列表，逗号分隔
- `TELEGRAM_DELIVERY_MODE`: `document` 或 `preview`

推荐：

- `document`: 更适合保留原始文件质量
- `preview`: 更适合直接在 Telegram 里看图看视频

示例：

```bash
TELEGRAM_BOT_TOKEN=123456:telegram-token \
TELEGRAM_ENABLED=true \
TELEGRAM_ALLOWED_CHAT_IDS=464100862 \
TELEGRAM_DELIVERY_MODE=document \
npm start
```

或者在 `compose.hub.yaml` / `compose.yaml` 对应环境变量里填写。

注意：

- 同一个 Telegram bot token 同时只能有一个长轮询实例；第二个实例会收到 `Conflict: terminated by other getUpdates request`
- 如果你只是想临时起一个副本做 UI / 鉴权 / API 检查，可以把 `TELEGRAM_ENABLED=false`，避免去抢主实例的轮询

如果你更喜欢在网页里配置 Telegram，可以直接把 Token / chat id 保存到控制台页面。配置文件默认保存在：

```text
<APP_CONFIG_PATH>
```

例如 Docker 默认配置文件路径是：

```text
/data/config/.rednote-config.json
```

Telegram 轮询状态默认会单独保存在：

```text
<APP_STATE_PATH>
```

默认值是：

```text
/data/config/.rednote-state.json
```

从旧版本升级时，如果你之前把配置保存在下载目录根部，服务启动时会自动把：

- `/data/.rednote-config.json`
- `/data/.rednote-state.json`

复制到新的 `/data/config/` 目录里。

如果旧版本的下载目录直接堆在 `/data` 根目录，服务启动时也会把符合旧命名规则的历史下载目录自动移动到：

```text
/data/downloads/
```

如果你计划把管理页暴露到非本机环境，建议同时配置：

- `REDNOTE_ADMIN_TOKEN`: 保护 `/api/config`、`/api/diagnostics`、`/api/openclaw/template`、`/api/telegram/status`
- `CORS_ALLOWED_ORIGINS`: 需要跨域访问控制台时，显式允许的 Origin 列表，逗号分隔

## OpenClaw Integration

项目内置了一个轻量 MCP server：

```text
src/mcp-server.js
```

推荐接法：

1. 启动本服务
2. 在首页 OpenClaw 面板里填写：
   - `Service Base URL`
   - `MCP Server Name`
   - `Preferred Agent ID`
   - `宿主机 MCP 脚本路径`
3. 把页面生成的 `mcporter` 片段加入 OpenClaw 的 MCP 配置
4. 把页面生成的 agent 提示词补进对应 agent

注意：

- 如果服务跑在 Docker 里，OpenClaw 一般跑在宿主机上，所以 `宿主机 MCP 脚本路径` 要填写宿主机真实路径，例如：
  `/Users/yourname/path/to/rednote/src/mcp-server.js`
- MCP server 默认会请求 `REDNOTE_SERVICE_BASE_URL` 对应的 `/api/openclaw/resolve`
- 工具返回的 `mediaUrls` 已经是适合 Telegram 发送的直链媒体地址

## GitHub Actions Auto Publish

仓库已经预留了 GitHub Actions 自动发布工作流：

- 文件位置：`.github/workflows/docker-publish.yml`
- `push` 到 `main` 时自动推送 `latest`
- 推送形如 `v0.2.9` 的 tag 时自动推送对应版本标签
- 同时构建 `linux/amd64` 和 `linux/arm64`

在 GitHub 仓库里补两个 Actions secrets 即可启用：

- `DOCKERHUB_USERNAME`
- `DOCKERHUB_TOKEN`

建议 `DOCKERHUB_TOKEN` 使用 Docker Hub 的 Access Token，而不是账户密码。

## 环境变量

- `PORT`: 服务端口，默认 `3000`
- `HOST`: 监听地址，本机默认 `127.0.0.1`，Docker 默认 `0.0.0.0`
- `DOWNLOAD_DIR`: 下载目录，默认 `/data/downloads`（Docker 内）
- `APP_CONFIG_PATH`: 可选。图形化配置保存路径，Docker 默认 `/data/config/.rednote-config.json`
- `APP_STATE_PATH`: 可选。Telegram 轮询状态保存路径，Docker 默认 `/data/config/.rednote-state.json`
- `REDNOTE_DATA_DIR`: 仅 compose 示例使用。宿主机映射到容器 `/data` 的根目录；NAS 建议使用绝对路径
- `PUID` / `PGID`: 仅 compose 示例使用。控制容器以哪个宿主机 uid/gid 写入挂载目录，默认 `1000:1000`
- `XHS_COOKIE`: 可选。公开页面被风控时可以尝试带上浏览器 Cookie
- `XHS_USER_AGENT`: 可选。覆盖默认浏览器 UA
- `REQUEST_TIMEOUT_MS`: 可选。请求超时，默认 `15000`
- `MEDIA_REQUEST_TIMEOUT_MS`: 可选。媒体请求的首包超时，默认 `30000`
- `TELEGRAM_ENABLED`: 可选。设为 `false` / `0` 时禁用 Telegram 轮询器；默认只要环境或已保存配置里有 token 就启用
- `TELEGRAM_BOT_TOKEN`: 可选。启用 Telegram bot 模式
- `TELEGRAM_ALLOWED_CHAT_IDS`: 可选。允许的 Telegram chat id，逗号分隔
- `TELEGRAM_DELIVERY_MODE`: 可选。`document` 或 `preview`，默认 `document`
- `REDNOTE_ADMIN_TOKEN`: 可选。设置后，管理接口需要携带 `X-Admin-Token`
- `CORS_ALLOWED_ORIGINS`: 可选。额外允许跨域调用的 Origin，逗号分隔；默认只允许同源页面

## 目录结构

```text
.
├── Dockerfile
├── README.md
├── compose.yaml
├── package.json
├── src
│   ├── server.js
│   └── xhs.js
└── test
    └── xhs.test.js
```
