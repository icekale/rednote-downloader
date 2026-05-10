FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache \
  py3-pip \
  python3 \
  su-exec

COPY package.json ./
COPY public ./public
COPY src ./src
COPY vendor/douyin-downloader /opt/douyin-downloader
COPY rednote-entrypoint.sh /usr/local/bin/rednote-entrypoint.sh
COPY start-internal-douyin.sh /usr/local/bin/start-internal-douyin.sh

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DOWNLOAD_DIR=/data/downloads
ENV APP_CONFIG_PATH=/data/config/.rednote-config.json
ENV APP_STATE_PATH=/data/config/.rednote-state.json
ENV DOUYIN_INTERNAL_DOWNLOADER_ENABLED=true
ENV DOUYIN_INTERNAL_DOWNLOADER_PORT=8000
ENV DOUYIN_PATH=/data/downloads/douyin
ENV DOUYIN_DOWNLOADER_OUTPUT_DIR=/data/downloads/douyin

RUN python3 -m venv /opt/douyin-venv \
  && /opt/douyin-venv/bin/pip install --no-cache-dir --upgrade pip \
  && /opt/douyin-venv/bin/pip install --no-cache-dir \
    -r /opt/douyin-downloader/requirements.txt \
    "fastapi>=0.100" \
    "uvicorn>=0.23" \
    "pydantic>=2.0" \
  && ln -sf /opt/douyin-venv/bin/python /usr/local/bin/python \
  && chmod +x /usr/local/bin/rednote-entrypoint.sh /usr/local/bin/start-internal-douyin.sh \
  && mkdir -p /data/downloads/douyin /data/config \
  && chown -R node:node /app /data /opt/douyin-downloader

EXPOSE 3000

ENTRYPOINT ["rednote-entrypoint.sh"]

CMD ["npm", "start"]
