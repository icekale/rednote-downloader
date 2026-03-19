FROM node:22-alpine

WORKDIR /app

RUN apk add --no-cache su-exec

COPY package.json ./
COPY public ./public
COPY src ./src
COPY rednote-entrypoint.sh /usr/local/bin/rednote-entrypoint.sh

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DOWNLOAD_DIR=/data/downloads
ENV APP_CONFIG_PATH=/data/config/.rednote-config.json
ENV APP_STATE_PATH=/data/config/.rednote-state.json

RUN chmod +x /usr/local/bin/rednote-entrypoint.sh \
  && mkdir -p /data/downloads /data/config \
  && chown -R node:node /app /data

EXPOSE 3000

ENTRYPOINT ["rednote-entrypoint.sh"]

CMD ["npm", "start"]
