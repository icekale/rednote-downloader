FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY public ./public
COPY src ./src

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DOWNLOAD_DIR=/data/downloads
ENV APP_CONFIG_PATH=/data/config/.rednote-config.json
ENV APP_STATE_PATH=/data/config/.rednote-state.json

RUN mkdir -p /data/downloads /data/config \
  && chown -R node:node /app /data

EXPOSE 3000

USER node

CMD ["npm", "start"]
