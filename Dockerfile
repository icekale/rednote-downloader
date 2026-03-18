FROM node:22-alpine

WORKDIR /app

COPY package.json ./
COPY public ./public
COPY src ./src

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3000
ENV DOWNLOAD_DIR=/data/downloads

RUN mkdir -p /data/downloads

EXPOSE 3000

CMD ["npm", "start"]
